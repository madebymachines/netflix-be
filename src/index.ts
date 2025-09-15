import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import prisma from './client';
import config from './config/config';
import logger from './config/logger';
import { socketService } from './services';

let server: HttpServer;
prisma.$connect().then(() => {
  logger.info('Connected to SQL Database');
  const httpServer = new HttpServer(app);

  // PERBAIKAN: Tambahkan konfigurasi CORS secara eksplisit di sini
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origin, // Pastikan ini sesuai dengan URL frontend Anda di Render
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Menegaskan transports yang diizinkan
    transports: ['websocket', 'polling']
  });

  socketService.init(io);
  logger.info('Socket.IO server initialized');

  server = httpServer.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
  });
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error: unknown) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
});
