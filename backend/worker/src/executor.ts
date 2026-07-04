import { prisma, logger, Job, JobStatus, calculateRetryDelay } from 'database';
import cronParser from 'cron-parser';
import { getHandler } from './handlers/registry.js';
import { redis } from './redis.js';
import { publishJobStatus } from './events.js';

/**
 * Executes a single job.
 * Handles retries, logging, cron rescheduling, and dead-letter queueing.
 * 
 * @param job The job record to execute
 * @param workerId ID of the worker executing the job
 */
export async function executeJob(job: Job, workerId: string): Promise<void> {
  const startTime = Date.now();
  
  // Fetch project ID for event broadcasting
  const queue = await prisma.queue.findUnique({
    where: { id: job.queueId },
    select: { projectId: true, retryPolicy: true },
  });

  const projectId = queue?.projectId || 'unknown';

  // 1. Update job to RUNNING status
  await prisma.job.update({
    where: { id: job.id },
    data: { status: 'RUNNING' },
  });

  // Broadcast status change
  await publishJobStatus(projectId, {
    jobId: job.id,
    status: 'RUNNING' as JobStatus,
    attempts: job.attempts,
    runAt: job.runAt,
    queueId: job.queueId,
    workerId,
  });

  // 2. Create JobExecution record
  const execution = await prisma.jobExecution.create({
    data: {
      jobId: job.id,
      workerId,
      status: 'SUCCESS', // Default, will change on error
    },
  });

  // Log function builder
  const writeLog = async (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
    try {
      await prisma.jobLog.create({
        data: {
          jobId: job.id,
          executionId: execution.id,
          level,
          message,
        },
      });
      logger.info({ jobId: job.id, level }, message);
    } catch (err) {
      logger.error(err, 'Failed to write job log to DB');
    }
  };

  await writeLog(`Worker ${workerId} started executing job ${job.id} of type ${job.type}`);

  const handler = getHandler(job.type);

  try {
    if (!handler) {
      throw new Error(`No registered handler found for job type: ${job.type}`);
    }

    // Run handler
    const result = await handler(job.payload, writeLog);

    const durationMs = Date.now() - startTime;

    // 3. Mark execution as SUCCESS
    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: {
        finishedAt: new Date(),
        durationMs,
      },
    });

    // 4. Mark job as COMPLETED
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        updatedAt: new Date(),
      },
    });

    await writeLog(`Job completed successfully in ${durationMs}ms`, 'INFO');

    // Broadcast update
    await publishJobStatus(projectId, {
      jobId: job.id,
      status: 'COMPLETED' as JobStatus,
      attempts: job.attempts,
      runAt: job.runAt,
      queueId: job.queueId,
      workerId,
    });

    // Reschedule if recurring (cron)
    if (job.cronExpression) {
      try {
        const interval = cronParser.parseExpression(job.cronExpression);
        const nextRun = interval.next().toDate();

        // Create the next job instance automatically
        const nextJob = await prisma.job.create({
          data: {
            queueId: job.queueId,
            type: job.type,
            payload: job.payload as any,
            priority: job.priority,
            status: 'SCHEDULED',
            runAt: nextRun,
            cronExpression: job.cronExpression,
            maxAttempts: job.maxAttempts,
          },
        });

        await writeLog(`Rescheduled recurring job. Next run at: ${nextRun.toISOString()}`, 'INFO');
        
        await publishJobStatus(projectId, {
          jobId: nextJob.id,
          status: 'SCHEDULED' as JobStatus,
          attempts: 0,
          runAt: nextJob.runAt,
          queueId: nextJob.queueId,
        });
      } catch (err: any) {
        await writeLog(`Failed to reschedule recurring job: ${err.message}`, 'ERROR');
      }
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err.message || 'Unknown error';

    // 1. Mark execution as FAILURE
    await prisma.jobExecution.update({
      where: { id: execution.id },
      data: {
        finishedAt: new Date(),
        status: 'FAILURE',
        errorMessage,
        durationMs,
      },
    });

    await writeLog(`Job execution failed: ${errorMessage}`, 'ERROR');

    // 2. Fetch retry policy
    const policy = queue?.retryPolicy || {
      strategy: 'FIXED',
      baseDelayMs: 1000,
      maxRetries: 3,
      maxDelayMs: 5000,
    };

    const nextAttempt = job.attempts + 1;
    const maxRetries = Math.min(job.maxAttempts, policy.maxRetries);

    if (nextAttempt < maxRetries) {
      // Requeue job with calculated delay
      const delay = calculateRetryDelay(nextAttempt, {
        strategy: policy.strategy as any,
        baseDelayMs: policy.baseDelayMs,
        maxDelayMs: policy.maxDelayMs,
      });

      const nextRunAt = new Date(Date.now() + delay);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'SCHEDULED',
          attempts: nextAttempt,
          runAt: nextRunAt,
          claimedByWorkerId: null,
          claimedAt: null,
        },
      });

      await writeLog(`Job scheduled for retry attempt #${nextAttempt} in ${delay}ms (runAt: ${nextRunAt.toISOString()})`, 'WARN');

      await publishJobStatus(projectId, {
        jobId: job.id,
        status: 'SCHEDULED' as JobStatus,
        attempts: nextAttempt,
        runAt: nextRunAt,
        queueId: job.queueId,
        error: errorMessage,
      });
    } else {
      // Exceeded max retries: move to Dead Letter Queue (DEAD_LETTER)
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'DEAD_LETTER',
            attempts: nextAttempt,
          },
        });

        await tx.deadLetterEntry.create({
          data: {
            jobId: job.id,
            reason: errorMessage,
            originalPayload: job.payload as any,
          },
        });
      });

      await writeLog(`Job attempts exhausted. Moved to Dead Letter Queue.`, 'ERROR');

      await publishJobStatus(projectId, {
        jobId: job.id,
        status: 'DEAD_LETTER' as JobStatus,
        attempts: nextAttempt,
        runAt: job.runAt,
        queueId: job.queueId,
        error: errorMessage,
      });
    }
  } finally {
    // 5. Decrement Redis in-flight count
    const inFlightKey = `in_flight:queue:${job.queueId}`;
    const newCount = await redis.decr(inFlightKey);
    // Ensure we don't go below 0
    if (newCount < 0) {
      await redis.set(inFlightKey, 0);
    }
  }
}
