import { prisma, logger, JobStatus } from 'database';
import { redis } from './redis.js';
import { publishJobStatus } from './events.js';

/**
 * Periodically searches for jobs stuck in CLAIMED/RUNNING whose workers
 * have crashed (stale heartbeat), and requeues them.
 */
export async function runReaper(): Promise<void> {
  const STALE_WORKER_TIMEOUT = parseInt(process.env.STALE_WORKER_TIMEOUT_MS || '15000', 10);
  const cutoffTime = new Date(Date.now() - STALE_WORKER_TIMEOUT);

  try {
    // 1. Find workers that are offline/stale but still marked online
    const staleWorkers = await prisma.worker.findMany({
      where: {
        status: { in: ['ONLINE', 'DRAINING'] },
        lastHeartbeatAt: { lt: cutoffTime },
      },
      select: { id: true },
    });

    if (staleWorkers.length === 0) {
      return;
    }

    const staleWorkerIds = staleWorkers.map((w) => w.id);

    // Mark these workers as OFFLINE
    await prisma.worker.updateMany({
      where: { id: { in: staleWorkerIds } },
      data: { status: 'OFFLINE' },
    });

    logger.info({ staleWorkerIds }, `Marked ${staleWorkerIds.length} stale workers as OFFLINE`);

    // 2. Find jobs claimed/running by these offline workers
    const stuckJobs = await prisma.job.findMany({
      where: {
        status: { in: ['CLAIMED', 'RUNNING'] },
        OR: [
          { claimedByWorkerId: { in: staleWorkerIds } },
          // Safeguard: even if worker isn't in database, check if job was claimed long ago and not completed
          {
            claimedAt: { lt: cutoffTime },
            claimedByWorkerId: { not: null },
          },
        ],
      },
      include: {
        queue: {
          select: { projectId: true },
        },
      },
    });

    if (stuckJobs.length === 0) {
      return;
    }

    logger.warn({ count: stuckJobs.length }, `Found ${stuckJobs.length} stuck jobs to reap`);

    // Requeuing stuck jobs
    for (const job of stuckJobs) {
      const nextAttempt = job.attempts + 1;

      await prisma.$transaction(async (tx) => {
        // Requeue the job
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'QUEUED',
            attempts: nextAttempt,
            claimedByWorkerId: null,
            claimedAt: null,
            runAt: new Date(), // run immediately
          },
        });

        // Write log
        await tx.jobLog.create({
          data: {
            jobId: job.id,
            level: 'WARN',
            message: `Job reaped and requeued because worker (${job.claimedByWorkerId}) went offline.`,
          },
        });
      });

      // Decrement Redis in-flight count for this queue
      const inFlightKey = `in_flight:queue:${job.queueId}`;
      const newCount = await redis.decr(inFlightKey);
      if (newCount < 0) {
        await redis.set(inFlightKey, 0);
      }

      // Broadcast update
      await publishJobStatus(job.queue.projectId, {
        jobId: job.id,
        status: 'QUEUED' as JobStatus,
        attempts: nextAttempt,
        runAt: new Date(),
        queueId: job.queueId,
      });

      logger.info({ jobId: job.id }, `Reaped job and set back to QUEUED`);
    }
  } catch (err) {
    logger.error(err, 'Error occurred in reaper process');
  }
}
