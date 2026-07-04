import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger, JobStatusChangedPayload, WorkerHeartbeatPayload } from 'database';

let io: SocketIOServer | null = null;

export function initSocket(server: HttpServer, frontendUrl: string): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: frontendUrl || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Socket.IO client connected');

    socket.on('join:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
      logger.info({ socketId: socket.id, projectId }, 'Client joined project room');
    });

    socket.on('leave:project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
      logger.info({ socketId: socket.id, projectId }, 'Client left project room');
    });

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Socket.IO client disconnected');
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

export function broadcastJobStatus(projectId: string, payload: JobStatusChangedPayload) {
  if (!io) return;
  io.to(`project:${projectId}`).emit('job:status_changed', payload);
  io.emit('job:status_changed_global', payload); // Fallback global broadcast
}

export function broadcastWorkerHeartbeat(payload: WorkerHeartbeatPayload) {
  if (!io) return;
  io.emit('worker:heartbeat', payload);
}
