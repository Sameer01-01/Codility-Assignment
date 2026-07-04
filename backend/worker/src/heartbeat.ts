import os from 'os';
import { prisma, logger, WorkerStatus } from 'database';
import { publishWorkerHeartbeat } from './events.js';

export interface HeartbeatConfig {
  workerId: string;
  hostname: string;
  pid: number;
}

/**
 * Registers the worker in the database.
 */
export async function registerWorker(config: HeartbeatConfig): Promise<void> {
  const { workerId, hostname, pid } = config;
  
  await prisma.worker.upsert({
    where: { id: workerId },
    update: {
      status: 'ONLINE',
      lastHeartbeatAt: new Date(),
    },
    create: {
      id: workerId,
      hostname,
      pid,
      status: 'ONLINE',
      startedAt: new Date(),
    },
  });

  logger.info({ workerId, hostname, pid }, 'Worker registered and online');
}

/**
 * Updates the worker heartbeat in the database and broadcasts via Redis.
 */
export async function sendHeartbeat(config: HeartbeatConfig, getActiveJobCount: () => number): Promise<void> {
  const { workerId, hostname, pid } = config;
  const currentLoad = getActiveJobCount();

  try {
    const now = new Date();

    // 1. Update Worker record
    await prisma.worker.update({
      where: { id: workerId },
      data: {
        lastHeartbeatAt: now,
        status: 'ONLINE',
      },
    });

    // 2. Create WorkerHeartbeat entry
    const metadata = {
      freeMemGb: Math.round((os.freemem() / (1024 * 1024 * 1024)) * 10) / 10,
      totalMemGb: Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10,
      cpuLoad: os.loadavg(),
    };

    await prisma.workerHeartbeat.create({
      data: {
        workerId,
        timestamp: now,
        currentLoad,
        metadata,
      },
    });

    // 3. Publish to Redis for WebSocket live update
    await publishWorkerHeartbeat({
      workerId,
      hostname,
      pid,
      status: 'ONLINE' as WorkerStatus,
      currentLoad,
      timestamp: now,
    });

    logger.debug({ workerId, currentLoad }, 'Heartbeat sent successfully');
  } catch (err) {
    logger.error(err, 'Failed to send worker heartbeat');
  }
}

/**
 * Sets worker status to OFFLINE or DRAINING.
 */
export async function setWorkerStatus(workerId: string, status: WorkerStatus): Promise<void> {
  try {
    await prisma.worker.update({
      where: { id: workerId },
      data: { status },
    });
    logger.info({ workerId, status }, `Worker status set to ${status}`);
  } catch (err) {
    logger.error(err, `Failed to set worker status to ${status}`);
  }
}
