import prisma from '../client';
import logger from '../config/logger';
import leaderboardService from './leaderboard.service';
import s3Service from './s3.service';
import settingService from './setting.service';
import emailService from './email.service';
import config from '../config/config';
import * as csv from 'fast-csv';
import { ReportStatus } from '@prisma/client';

/**
 * Mengubah data pemenang menjadi buffer CSV.
 * @param winners - Array data pemenang.
 * @returns Buffer CSV.
 */
const generateWinnersCsv = (winners: any[]): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    const csvStream = csv.format({ headers: true });

    csvStream.on('data', (chunk) => chunks.push(chunk));
    csvStream.on('end', () => resolve(Buffer.concat(chunks)));
    csvStream.on('error', reject);

    winners.forEach((winner) => {
      csvStream.write({
        Rank: winner.rank,
        Username: winner.username,
        Country: winner.country,
        Points: winner.points
      });
    });

    csvStream.end();
  });
};

/**
 * Memproses dan mengirimkan laporan pemenang mingguan yang tertunda.
 */
const processAndSendWeeklyReport = async (): Promise<void> => {
  logger.info('Checking for pending weekly winner reports...');

  // 1. Cari laporan yang perlu diproses
  const reportToSend = await prisma.weeklyWinnerReport.findFirst({
    where: {
      status: ReportStatus.PENDING,
      periodEnd: {
        lte: new Date() // Cari yang periodenya sudah berakhir
      }
    },
    orderBy: {
      weekNumber: 'asc'
    }
  });

  if (!reportToSend) {
    logger.info('No pending weekly reports to process at this time.');
    return;
  }

  logger.info(`Processing report for Week ${reportToSend.weekNumber}...`);

  try {
    // 2. Ambil data pemenang menggunakan service yang sudah direfaktor
    const { leaderboard: winners } = await leaderboardService.getPublicLeaderboard({
      timespan: 'weekly', // Tetap gunakan weekly untuk logika agregasi
      startDate: reportToSend.periodStart,
      endDate: reportToSend.periodEnd,
      limit: 10, // Ambil 10 pemenang
      fetchAll: false
    });

    if (winners.length === 0) {
      logger.info(`No winners found for Week ${reportToSend.weekNumber}. Marking as sent.`);
      await prisma.weeklyWinnerReport.update({
        where: { id: reportToSend.id },
        data: {
          status: ReportStatus.SENT,
          sentAt: new Date(),
          recipientList: 'No recipients (no winners).'
        }
      });
      return;
    }

    // 3. Generate CSV
    const csvBuffer = await generateWinnersCsv(winners);

    // 4. Upload ke S3
    const reportFolder = config.aws.s3.reportFolder || 'weekly-winner-reports';
    const { key } = await s3Service.uploadPrivateFile(csvBuffer, 'csv', 'text/csv', reportFolder);
    logger.info(
      `Weekly report CSV for Week ${reportToSend.weekNumber} uploaded to S3 with key: ${key}`
    );

    // 5. Ambil daftar penerima
    const recipients = await settingService.getWinnerEmailRecipients();
    if (recipients.length === 0) {
      logger.warn(
        `No email recipients configured for weekly reports. Marking report as sent without sending email.`
      );
      await prisma.weeklyWinnerReport.update({
        where: { id: reportToSend.id },
        data: {
          status: ReportStatus.SENT,
          sentAt: new Date(),
          s3FileKey: key,
          recipientList: 'No recipients configured.'
        }
      });
      return;
    }

    // 6. Kirim email dengan lampiran
    await emailService.sendWinnerReportEmail(recipients, reportToSend.weekNumber, csvBuffer);
    logger.info(
      `Weekly winner report for Week ${reportToSend.weekNumber} sent to: ${recipients.join(', ')}`
    );

    // 7. Update status laporan di database
    await prisma.weeklyWinnerReport.update({
      where: { id: reportToSend.id },
      data: {
        status: ReportStatus.SENT,
        sentAt: new Date(),
        s3FileKey: key,
        recipientList: recipients.join(', ')
      }
    });
  } catch (error) {
    logger.error(`Failed to process weekly report for Week ${reportToSend.weekNumber}:`, error);
    await prisma.weeklyWinnerReport.update({
      where: { id: reportToSend.id },
      data: {
        status: ReportStatus.FAILED
      }
    });
  }
};

/**
 * Mengambil histori semua laporan mingguan.
 * @returns Daftar laporan dengan URL unduhan jika tersedia.
 */
const getReportHistory = async () => {
  const reports = await prisma.weeklyWinnerReport.findMany({
    orderBy: {
      weekNumber: 'asc'
    }
  });

  const reportsWithUrls = await Promise.all(
    reports.map(async (report) => {
      let downloadUrl = null;
      if (report.s3FileKey) {
        try {
          // URL berlaku selama 1 jam
          downloadUrl = await s3Service.getPresignedUrl(report.s3FileKey, 3600);
        } catch (error) {
          logger.error(`Failed to get presigned URL for key ${report.s3FileKey}:`, error);
        }
      }
      return { ...report, downloadUrl };
    })
  );

  return reportsWithUrls;
};

// --- FUNGSI BARU DIMULAI DI SINI ---
/**
 * Mengambil daftar jadwal mingguan dari database.
 * @returns Daftar jadwal mingguan untuk dropdown di frontend.
 */
const getReportSchedules = async () => {
  const schedules = await prisma.weeklyWinnerReport.findMany({
    select: {
      weekNumber: true,
      periodStart: true,
      periodEnd: true
    },
    orderBy: {
      weekNumber: 'asc'
    }
  });

  return schedules.map((s) => ({
    week: s.weekNumber,
    label: `Week ${s.weekNumber}`,
    start: s.periodStart.toISOString(),
    end: s.periodEnd.toISOString()
  }));
};
// --- FUNGSI BARU SELESAI DI SINI ---

export default {
  processAndSendWeeklyReport,
  getReportHistory,
  getReportSchedules // Export fungsi baru
};
