import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from '../config/logger';

class SocketService {
  private io: SocketIOServer | null = null;
  private adminSockets = new Map<number, string>(); // Map<adminId, socketId>

  public init(io: SocketIOServer): void {
    this.io = io;
    this.io.on('connection', (socket: Socket) => {
      const adminId = socket.handshake.query.adminId as string;

      if (adminId) {
        const id = parseInt(adminId, 10);
        this.adminSockets.set(id, socket.id);
        logger.info(`Admin ${id} connected with socket ${socket.id}`);

        socket.on('disconnect', () => {
          if (this.adminSockets.get(id) === socket.id) {
            this.adminSockets.delete(id);
            logger.info(`Admin ${id} disconnected from socket ${socket.id}`);
          }
        });
      }
    });
  }

  public emitToAdmin(adminId: number, event: string, data: any): void {
    const socketId = this.adminSockets.get(adminId);
    if (socketId && this.io) {
      this.io.to(socketId).emit(event, data);
      logger.info(`Emitted event '${event}' to admin ${adminId} on socket ${socketId}`);
    } else {
      logger.warn(`Could not find active socket for admin ${adminId} to emit event '${event}'`);
    }
  }
}

const socketService = new SocketService();
export default socketService;
