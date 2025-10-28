import cron from 'node-cron';
import logger from './config/logger';
import { weeklyReportService } from './services';

const startSchedulers = () => {
  logger.info('Initializing schedulers...');

  // Jadwalkan untuk berjalan setiap hari pukul 02:00 pagi waktu server
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running daily check for weekly winner report...');
    try {
      await weeklyReportService.processAndSendWeeklyReport();
    } catch (error) {
      logger.error('An error occurred during the scheduled weekly report job:', error);
    }
  });

  logger.info('Schedulers started.');
};

export { startSchedulers };
