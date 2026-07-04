import os from 'os';
import crypto from 'crypto';
import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import { logger } from 'database';
import { claimJobs } from './claim.js';
import { executeJob } from './executor.js';
import { registerWorker, sendHeartbeat, setWorkerStatus } from './heartbeat.js';
import { runReaper } from './reaper.js';
import { redis } from './redis.js';

// Configuration
const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000', 10);
const HEARTBEAT_INTERVAL = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '5000', 10);
const REAPER_INTERVAL = parseInt(process.env.REAPER_INTERVAL_MS || '10000', 10);

// Worker identity
const hostname = os.hostname();
const pid = process.pid;
const randomId = crypto.randomBytes(4).toString('hex');
const workerId = `worker-${hostname}-${pid}-${randomId}`;

const config = { workerId, hostname, pid };

// Active jobs tracker
let activeJobsCount = 0;
let isShuttingDown = false;
let pollTimeout: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let reaperInterval: NodeJS.Timeout | null = null;

async function start() {
  logger.info({ workerId }, 'Starting worker process...');

  // 1. Register worker
  await registerWorker(config);

  // 2. Start heartbeat loop
  heartbeatInterval = setInterval(async () => {
    await sendHeartbeat(config, () => activeJobsCount);
  }, HEARTBEAT_INTERVAL);

  // 3. Start reaper loop (run reaper periodically)
  reaperInterval = setInterval(async () => {
    logger.debug('Running reaper check...');
    await runReaper();
  }, REAPER_INTERVAL);

  // Run immediate first heartbeat and reaper checks
  await sendHeartbeat(config, () => activeJobsCount);
  await runReaper();

  // 4. Start polling loop
  poll();
}

async function poll() {
  if (isShuttingDown) return;

  try {
    // Only claim jobs if not shutting down/draining
    const claimed = await claimJobs(workerId);
    
    if (claimed.length > 0) {
      logger.info(`Claimed ${claimed.length} jobs to execute`);
      
      for (const job of claimed) {
        activeJobsCount++;
        
        // Execute job in the background asynchronously
        executeJob(job, workerId)
          .catch((err) => {
            logger.error(err, `Error executing job ${job.id}`);
          })
          .finally(() => {
            activeJobsCount--;
            logger.debug(`Job ${job.id} execution finished. Active jobs: ${activeJobsCount}`);
          });
      }
    }
  } catch (err) {
    logger.error(err, 'Error in worker polling loop');
  }

  // Schedule next poll
  pollTimeout = setTimeout(poll, POLL_INTERVAL);
}

// Graceful shutdown
async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.warn(`Received ${signal}. Starting graceful shutdown...`);

  // Stop polling and reaper checks
  if (pollTimeout) clearTimeout(pollTimeout);
  if (reaperInterval) clearInterval(reaperInterval);

  // Update status to DRAINING
  await setWorkerStatus(workerId, 'DRAINING');

  // Wait for active jobs to finish (up to 15 seconds)
  const shutdownTimeout = 15000;
  const startTime = Date.now();

  while (activeJobsCount > 0 && Date.now() - startTime < shutdownTimeout) {
    logger.info(`Waiting for ${activeJobsCount} active jobs to finish...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (activeJobsCount > 0) {
    logger.error(`Shutdown timeout reached. Exiting with ${activeJobsCount} jobs still in-flight.`);
  } else {
    logger.info('All jobs finished. Exiting cleanly.');
  }

  // Clean loops and connections
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  await setWorkerStatus(workerId, 'OFFLINE');
  
  // Close Redis client
  redis.disconnect();

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.fatal(err, 'Failed to start worker');
  process.exit(1);
});
