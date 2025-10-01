import { PrismaClient, ExportType, JobStatus, Admin } from '@prisma/client';
import * as csv from 'fast-csv';
import prisma from '../client';
import logger from '../config/logger';
import userService from './user.service';
import leaderboardService from './leaderboard.service';
import activityService from './activity.service';
import s3Service from './s3.service';
import socketService from './socket.service';
import emailService from './email.service';
import adminService from './admin.service';

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
  data.forEach((user: any) => {
    csvStream.write({
      ID: user.id,
      Username: user.username,
      Email: user.email,
      Country: user.country,
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
          Streak: 'streak'
        }
      : {
          Rank: 'rank',
          Username: 'username',
          Country: 'country',
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

const processVerificationsExport = async (filters: any) => {
  const { dateRange, status } = filters;
  const result: any = await userService.queryPurchaseVerifications(
    { status, dateRange },
    { fetchAll: true }
  );
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
  data.forEach((item: any) => {
    csvStream.write({
      ID: item.id,
      'User Username': item.user.username,
      'User Email': item.user.email,
      Type: item.type,
      Status: item.status,
      'Submitted At': item.submittedAt,
      'Reviewed At': item.reviewedAt
    });
  });
  csvStream.end();

  return new Promise<Buffer>((resolve, reject) => {
    writableStream.on('finish', () => resolve(Buffer.concat(chunks)));
    writableStream.on('error', reject);
  });
};

const processSubmissionsExport = async (filters: any) => {
  const { dateRange, status } = filters;
  const result: any = await activityService.queryActivitySubmissions(
    { status, dateRange },
    { fetchAll: true }
  );
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
  data.forEach((item: any) => {
    csvStream.write({
      ID: item.id,
      'User Username': item.user.username,
      'User Email': item.user.email,
      'Event Type': item.eventType,
      Points: item.pointsEarn,
      Status: item.status,
      'Submitted At': item.createdAt,
      'Reviewed At': item.reviewedAt
    });
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
    switch (job.type) {
      case ExportType.PARTICIPANTS:
        fileBuffer = await processParticipantsExport(job.filters);
        break;
      case ExportType.LEADERBOARD:
        fileBuffer = await processLeaderboardExport(job.filters);
        break;
      case ExportType.VERIFICATIONS:
        fileBuffer = await processVerificationsExport(job.filters);
        break;
      case ExportType.SUBMISSIONS:
        fileBuffer = await processSubmissionsExport(job.filters);
        break;
      default:
        throw new Error('Unsupported export type');
    }

    const { key } = await s3Service.uploadPrivateFile(fileBuffer, 'csv', 'text/csv', 'exports');
    const downloadUrl = await s3Service.getPresignedUrl(key, 86400);

    const updatedJob = await prisma.exportJob.update({
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

    if (updatedJob.notificationEmail) {
      const admin = await adminService.getAdminById(updatedJob.requestedByAdminId);
      if (admin) {
        await emailService.sendExportReadyEmail(
          updatedJob.notificationEmail,
          admin.name,
          downloadUrl
        );
      }
    }
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
  const { email, ...restFilters } = filters;
  const job = await prisma.exportJob.create({
    data: {
      type,
      filters: restFilters,
      notificationEmail: email,
      requestedByAdminId: adminId
    }
  });

  processJob(job.jobId).catch((e) =>
    logger.error(`Error in background job processing for ${job.jobId}:`, e)
  );

  return job;
};

export default { createExportJob };
