import { createServer } from 'http';
import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import { app } from './app.js';
import { initSocket, broadcastJobStatus, broadcastWorkerHeartbeat } from './websocket/index.js';
import { logger } from 'database';
import { Redis } from 'ioredis';

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const server = createServer(app);

// Initialize WebSockets
initSocket(server, FRONTEND_URL);

// Subscribe to worker events via Redis Pub/Sub
const redisSubscriber = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisSubscriber.on('connect', () => {
  logger.info('API server subscriber connected to Redis');
});

redisSubscriber.on('error', (err) => {
  logger.error(err, 'Redis Subscriber Error');
});

// Subscribe to channels
redisSubscriber.subscribe('job:status_changed', 'worker:heartbeat', (err, count) => {
  if (err) {
    logger.error(err, 'Failed to subscribe to Redis channels');
  } else {
    logger.info(`Subscribed successfully to ${count} channels`);
  }
});

// Message listener
redisSubscriber.on('message', (channel, message) => {
  try {
    const payload = JSON.parse(message);
    
    if (channel === 'job:status_changed') {
      const { projectId, jobId, status, attempts, runAt, queueId, workerId, error } = payload;
      broadcastJobStatus(projectId, {
        jobId,
        status,
        attempts,
        runAt: new Date(runAt),
        queueId,
        workerId,
        error,
      });
    } else if (channel === 'worker:heartbeat') {
      const { workerId, hostname, pid, status, currentLoad, timestamp } = payload;
      broadcastWorkerHeartbeat({
        workerId,
        hostname,
        pid,
        status,
        currentLoad,
        timestamp: new Date(timestamp),
      });
    }
  } catch (err) {
    logger.error(err, 'Error parsing/handling incoming Redis Pub/Sub message');
  }
});

server.listen(PORT, () => {
  logger.info(`API Server is running on port ${PORT}`);
});
