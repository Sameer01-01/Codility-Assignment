import { Router } from 'express';
import cronParser from 'cron-parser';
import crypto from 'crypto';
import { prisma } from 'database';
import { authenticate, requireProjectMember } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createJobSchema, createBatchJobsSchema } from './schema.js';
import { broadcastJobStatus } from '../../websocket/index.js';

const router = Router();

// Middleware to verify access to a job's queue/project
async function requireJobQueueAccess(req: any, res: any, next: any) {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthenticated', code: 'UNAUTHORIZED' } });
    return;
  }

  const queueId = req.body.queueId || req.query.queueId || (req.params.jobId ? null : null);

  if (!queueId && req.params.jobId) {
    try {
      const job = await prisma.job.findUnique({
        where: { id: req.params.jobId },
        select: { queueId: true },
      });
      if (!job) {
        res.status(404).json({ error: { message: 'Job not found', code: 'NOT_FOUND' } });
        return;
      }
      const queue = await prisma.queue.findUnique({
        where: { id: job.queueId },
        select: { projectId: true },
      });
      if (!queue) {
        res.status(404).json({ error: { message: 'Queue not found', code: 'NOT_FOUND' } });
        return;
      }
      req.params.projectId = queue.projectId;
      return requireProjectMember()(req, res, next);
    } catch (err) {
      return next(err);
    }
  }

  if (queueId) {
    try {
      const queue = await prisma.queue.findUnique({
        where: { id: queueId },
        select: { projectId: true },
      });
      if (!queue) {
        res.status(404).json({ error: { message: 'Queue not found', code: 'NOT_FOUND' } });
        return;
      }
      req.params.projectId = queue.projectId;
      return requireProjectMember()(req, res, next);
    } catch (err) {
      return next(err);
    }
  }

  res.status(400).json({ error: { message: 'Queue ID or Job ID required to verify access', code: 'BAD_REQUEST' } });
}

// POST /jobs (Create single job)
router.post('/', authenticate, requireJobQueueAccess, validate(createJobSchema), async (req, res, next) => {
  const { queueId, type, payload, priority, idempotencyKey, delayMs, runAt, cronExpression } = req.body;

  try {
    // 1. Calculate runAt
    let calculatedRunAt = new Date();
    let initialStatus = 'QUEUED';

    if (delayMs !== undefined) {
      calculatedRunAt = new Date(Date.now() + delayMs);
      initialStatus = 'SCHEDULED';
    } else if (runAt !== undefined) {
      calculatedRunAt = new Date(runAt);
      if (calculatedRunAt.getTime() > Date.now()) {
        initialStatus = 'SCHEDULED';
      }
    } else if (cronExpression) {
      try {
        const interval = cronParser.parseExpression(cronExpression);
        calculatedRunAt = interval.next().toDate();
        initialStatus = 'SCHEDULED';
      } catch (err) {
        res.status(400).json({ error: { message: 'Invalid cron expression', code: 'INVALID_CRON' } });
        return;
      }
    }

    // Check queue status
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      select: { status: true, projectId: true },
    });

    if (!queue) {
      res.status(404).json({ error: { message: 'Queue not found', code: 'NOT_FOUND' } });
      return;
    }

    // 2. Handle Idempotency Key
    if (idempotencyKey) {
      const existingJob = await prisma.job.findUnique({
        where: { idempotencyKey },
      });

      if (existingJob) {
        res.json(existingJob);
        return;
      }
    }

    // 3. Create job
    const job = await prisma.job.create({
      data: {
        queueId,
        type,
        payload,
        priority,
        status: initialStatus as any,
        runAt: calculatedRunAt,
        cronExpression,
        idempotencyKey,
      },
    });

    // 4. Broadcast
    broadcastJobStatus(queue.projectId, {
      jobId: job.id,
      status: job.status,
      attempts: job.attempts,
      runAt: job.runAt,
      queueId: job.queueId,
    });

    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

// POST /jobs/batch (Submit multiple jobs as a batch)
router.post('/batch', authenticate, requireJobQueueAccess, validate(createBatchJobsSchema), async (req, res, next) => {
  const { queueId, jobs } = req.body;

  try {
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      select: { projectId: true },
    });

    if (!queue) {
      res.status(404).json({ error: { message: 'Queue not found', code: 'NOT_FOUND' } });
      return;
    }

    const batchId = crypto.randomUUID();
    const createdJobs = [];

    // Create jobs inside transaction to ensure batch atomic submission
    const result = await prisma.$transaction(async (tx) => {
      const jobPromises = jobs.map(async (jobSpec: any) => {
        let calculatedRunAt = new Date();
        let initialStatus = 'QUEUED';

        if (jobSpec.delayMs !== undefined) {
          calculatedRunAt = new Date(Date.now() + jobSpec.delayMs);
          initialStatus = 'SCHEDULED';
        } else if (jobSpec.runAt !== undefined) {
          calculatedRunAt = new Date(jobSpec.runAt);
          if (calculatedRunAt.getTime() > Date.now()) {
            initialStatus = 'SCHEDULED';
          }
        }

        // Idempotency check inside transaction
        if (jobSpec.idempotencyKey) {
          const existing = await tx.job.findUnique({ where: { idempotencyKey: jobSpec.idempotencyKey } });
          if (existing) return existing;
        }

        return tx.job.create({
          data: {
            queueId,
            type: jobSpec.type,
            payload: jobSpec.payload,
            priority: jobSpec.priority || 0,
            status: initialStatus as any,
            runAt: calculatedRunAt,
            batchId,
            idempotencyKey: jobSpec.idempotencyKey,
          },
        });
      });

      return Promise.all(jobPromises);
    });

    // Broadcast all
    for (const job of result) {
      broadcastJobStatus(queue.projectId, {
        jobId: job.id,
        status: job.status,
        attempts: job.attempts,
        runAt: job.runAt,
        queueId: job.queueId,
      });
    }

    res.status(201).json({
      batchId,
      jobs: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /jobs/batch/:batchId
router.get('/batch/:batchId', authenticate, async (req, res, next) => {
  const { batchId } = req.params;

  try {
    const jobs = await prisma.job.findMany({
      where: { batchId },
      select: { status: true },
    });

    if (jobs.length === 0) {
      res.status(404).json({ error: { message: 'Batch not found or empty', code: 'NOT_FOUND' } });
      return;
    }

    const counts = {
      QUEUED: 0,
      SCHEDULED: 0,
      CLAIMED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      DEAD_LETTER: 0,
    };

    for (const job of jobs) {
      counts[job.status] = (counts[job.status] || 0) + 1;
    }

    const completed = counts.COMPLETED;
    const failed = counts.FAILED + counts.DEAD_LETTER;
    const pending = counts.QUEUED + counts.SCHEDULED + counts.CLAIMED + counts.RUNNING;
    const total = jobs.length;
    const percentComplete = Math.round(((completed + failed) / total) * 100);

    res.json({
      batchId,
      total,
      counts,
      percentComplete,
      isFinished: pending === 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /jobs (Filter, search, paginate)
router.get('/', authenticate, async (req, res, next) => {
  const projectId = req.query.projectId as string;
  const queueId = req.query.queueId as string;
  const status = req.query.status as string;
  const type = req.query.type as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  try {
    const where: any = {};
    
    if (queueId) {
      where.queueId = queueId;
    } else if (projectId) {
      where.queue = { projectId };
    } else {
      res.status(400).json({ error: { message: 'projectId or queueId is required', code: 'BAD_REQUEST' } });
      return;
    }

    // Verify access to project
    const pId = projectId || (await prisma.queue.findUnique({ where: { id: queueId }, select: { projectId: true } }))?.projectId;
    if (!pId) {
      res.status(404).json({ error: { message: 'Project or Queue not found', code: 'NOT_FOUND' } });
      return;
    }
    
    const membership = await prisma.orgMembership.findFirst({
      where: {
        userId: req.user!.id,
        organization: {
          projects: {
            some: { id: pId }
          }
        }
      }
    });

    if (!membership) {
      res.status(403).json({ error: { message: 'Forbidden: Access denied', code: 'FORBIDDEN' } });
      return;
    }

    if (status) {
      where.status = status;
    }
    if (type) {
      where.type = type;
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { runAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          queue: {
            select: { name: true }
          }
        }
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      jobs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /jobs/:jobId
router.get('/:jobId', authenticate, requireJobQueueAccess, async (req, res, next) => {
  const { jobId } = req.params;

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        queue: true,
        executions: {
          orderBy: { startedAt: 'desc' },
        },
        logs: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!job) {
      res.status(404).json({ error: { message: 'Job not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json(job);
  } catch (err) {
    next(err);
  }
});

// POST /jobs/:jobId/retry
router.post('/:jobId/retry', authenticate, requireJobQueueAccess, async (req, res, next) => {
  const { jobId } = req.params;

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { queue: true },
    });

    if (!job) {
      res.status(404).json({ error: { message: 'Job not found', code: 'NOT_FOUND' } });
      return;
    }

    if (job.status !== 'FAILED' && job.status !== 'DEAD_LETTER') {
      res.status(400).json({
        error: { message: `Cannot retry job in status ${job.status}`, code: 'INVALID_STATUS' },
      });
      return;
    }

    // Reset attempts and set runAt to now
    const updated = await prisma.$transaction(async (tx) => {
      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: {
          status: 'QUEUED',
          attempts: 0,
          runAt: new Date(),
          claimedAt: null,
          claimedByWorkerId: null,
        },
      });

      // Remove DeadLetterEntry if it exists
      await tx.deadLetterEntry.deleteMany({
        where: { jobId },
      });

      // Write log
      await tx.jobLog.create({
        data: {
          jobId,
          level: 'INFO',
          message: 'Job manually retried by user',
        },
      });

      return updatedJob;
    });

    broadcastJobStatus(job.queue.projectId, {
      jobId: updated.id,
      status: updated.status,
      attempts: updated.attempts,
      runAt: updated.runAt,
      queueId: updated.queueId,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /jobs/:jobId/cancel
router.post('/:jobId/cancel', authenticate, requireJobQueueAccess, async (req, res, next) => {
  const { jobId } = req.params;

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { queue: true },
    });

    if (!job) {
      res.status(404).json({ error: { message: 'Job not found', code: 'NOT_FOUND' } });
      return;
    }

    if (job.status !== 'QUEUED' && job.status !== 'SCHEDULED') {
      res.status(400).json({
        error: { message: `Cannot cancel job in active/completed status ${job.status}`, code: 'INVALID_STATUS' },
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
        },
      });

      await tx.jobLog.create({
        data: {
          jobId,
          level: 'WARN',
          message: 'Job cancelled by user',
        },
      });

      return updatedJob;
    });

    broadcastJobStatus(job.queue.projectId, {
      jobId: updated.id,
      status: updated.status,
      attempts: updated.attempts,
      runAt: updated.runAt,
      queueId: updated.queueId,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /dead-letter (Query dead letter queue)
router.get('/dead-letter/list', authenticate, async (req, res, next) => {
  const projectId = req.query.projectId as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  if (!projectId) {
    res.status(400).json({ error: { message: 'projectId is required', code: 'BAD_REQUEST' } });
    return;
  }

  try {
    // Auth check
    const membership = await prisma.orgMembership.findFirst({
      where: {
        userId: req.user!.id,
        organization: {
          projects: {
            some: { id: projectId }
          }
        }
      }
    });

    if (!membership) {
      res.status(403).json({ error: { message: 'Forbidden', code: 'FORBIDDEN' } });
      return;
    }

    const [entries, total] = await Promise.all([
      prisma.deadLetterEntry.findMany({
        where: {
          job: {
            queue: { projectId }
          }
        },
        orderBy: { failedAt: 'desc' },
        skip,
        take: limit,
        include: {
          job: {
            select: {
              id: true,
              type: true,
              queue: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }),
      prisma.deadLetterEntry.count({
        where: {
          job: {
            queue: { projectId }
          }
        }
      })
    ]);

    res.json({
      entries,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
