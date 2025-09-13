import { PrismaClient, ExportType, JobStatus } from '@prisma/client';
import * as csv from 'fast-csv';
import prisma from '../client';
import logger from '../config/logger';
import userService from './user.service';
import leaderboardService from './leaderboard.service';
import s3Service from './s3.service';
import socketService from './socket.service';

const processParticipantsExport = async (filters: any) => {
  const { isBanned } = filters;
  const result = await userService.queryUsers({ isBanned }, { fetchAll: true });
  const data = result.data;

  const csvStream = csv.format({ headers: true });
  const chunks: any[] = [];
  const writableStream = new (require('stream').Writable)({
    write(chunk: any, encoding: any, callback: any) {
      chunks.push(chunk);
      callback();
    }
  });

  csvStream.pipe(writableStream);
  data.forEach((user) => {
    csvStream.write({
      ID: user.id,
      Name: user.name,
      Username: user.username,
      Email: user.email,
      Country: user.country,
      Gender: user.gender,
      'Verification Status': user.purchaseStatus,
      'Is Banned': user.isBanned,
      'Registered At': user.createdAt
    });
  });
  csvStream.end();

  return new Promise<Buffer>((resolve, reject) => {
    writableStream.on('finish', () => resolve(Buffer.concat(chunks)));
    writableStream.on('error', reject);
  });
};

const processLeaderboardExport = async (filters: any) => {
  const { timespan } = filters;
  const { leaderboard } = await leaderboardService.getPublicLeaderboard({
    timespan,
    fetchAll: true
  });

  const csvStream = csv.format({ headers: true });
  const chunks: any[] = [];
  const writableStream = new (require('stream').Writable)({
    write(chunk: any, encoding: any, callback: any) {
      chunks.push(chunk);
      callback();
    }
  });

  csvStream.pipe(writableStream);

  const headers =
    timespan === 'streak'
      ? {
          Rank: 'rank',
          Username: 'username',
          Country: 'country',
          Gender: 'gender',
          Streak: 'streak'
        }
      : {
          Rank: 'rank',
          Username: 'username',
          Country: 'country',
          Gender: 'gender',
          Points: 'points'
        };

  leaderboard.forEach((entry: any) => {
    const row: { [key: string]: any } = {};
    for (const key in headers) {
      row[key] = entry[(headers as any)[key]];
    }
    csvStream.write(row);
  });
  csvStream.end();

  return new Promise<Buffer>((resolve, reject) => {
    writableStream.on('finish', () => resolve(Buffer.concat(chunks)));
    writableStream.on('error', reject);
  });
};

const processJob = async (jobId: string) => {
  let job;
  try {
    job = await prisma.exportJob.update({
      where: { jobId },
      data: { status: JobStatus.PROCESSING }
    });

    let fileBuffer: Buffer;
    if (job.type === ExportType.PARTICIPANTS) {
      fileBuffer = await processParticipantsExport(job.filters);
    } else if (job.type === ExportType.LEADERBOARD) {
      fileBuffer = await processLeaderboardExport(job.filters);
    } else {
      throw new Error('Unsupported export type');
    }

    const fileName = `${job.type.toLowerCase()}_${Date.now()}.csv`;
    const downloadUrl = await s3Service.uploadFile(fileBuffer, fileName, 'text/csv', 'exports');

    await prisma.exportJob.update({
      where: { jobId },
      data: {
        status: JobStatus.COMPLETED,
        downloadUrl,
        completedAt: new Date()
      }
    });

    socketService.emitToAdmin(job.requestedByAdminId, 'export:completed', {
      jobId,
      downloadUrl
    });
  } catch (error: any) {
    logger.error(`Failed to process export job ${jobId}:`, error);
    if (job) {
      await prisma.exportJob.update({
        where: { jobId },
        data: {
          status: JobStatus.FAILED,
          error: error.message,
          completedAt: new Date()
        }
      });
      socketService.emitToAdmin(job.requestedByAdminId, 'export:failed', {
        jobId,
        error: error.message
      });
    }
  }
};

const createExportJob = async (type: ExportType, filters: any, adminId: number) => {
  const job = await prisma.exportJob.create({
    data: {
      type,
      filters,
      requestedByAdminId: adminId
    }
  });

  // Run the job processing in the background (fire-and-forget)
  processJob(job.jobId).catch((e) =>
    logger.error(`Error in background job processing for ${job.jobId}:`, e)
  );

  return job;
};

export default { createExportJob };
