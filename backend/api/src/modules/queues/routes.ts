import { Router } from 'express';
import { prisma } from 'database';
import { authenticate, requireProjectMember } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createQueueSchema, updateQueueSchema } from './schema.js';

const router = Router();

// Middleware to check access to queue by project membership
async function requireQueueAccess(req: any, res: any, next: any) {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthenticated', code: 'UNAUTHORIZED' } });
    return;
  }

  const { queueId } = req.params;
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
    next(err);
  }
}

// GET /queues
router.get('/', authenticate, async (req, res, next) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    res.status(400).json({ error: { message: 'projectId query parameter is required', code: 'BAD_REQUEST' } });
    return;
  }

  // Bind projectId to req.params for standard checks
  req.params.projectId = projectId;
  return requireProjectMember()(req, res, async () => {
    try {
      const queues = await prisma.queue.findMany({
        where: { projectId },
        include: {
          retryPolicy: true,
          _count: {
            select: { jobs: true },
          },
        },
        orderBy: { name: 'asc' },
      });
      res.json(queues);
    } catch (err) {
      next(err);
    }
  });
});

// POST /queues
router.post('/', authenticate, async (req, res, next) => {
  const { projectId } = req.body;
  req.params.projectId = projectId;

  return requireProjectMember()(req, res, async () => {
    try {
      // Validate schema
      const { name, priority, concurrencyLimit, retryPolicyId } = req.body;
      const queue = await prisma.queue.create({
        data: {
          projectId,
          name,
          priority,
          concurrencyLimit,
          retryPolicyId,
        },
        include: { retryPolicy: true },
      });
      res.status(201).json(queue);
    } catch (err) {
      next(err);
    }
  });
});

// GET /queues/:queueId
router.get('/:queueId', requireQueueAccess, async (req, res, next) => {
  const { queueId } = req.params;
  try {
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      include: { retryPolicy: true },
    });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// PUT /queues/:queueId
router.put('/:queueId', requireQueueAccess, validate(updateQueueSchema), async (req, res, next) => {
  const { queueId } = req.params;
  const { name, priority, concurrencyLimit, status, retryPolicyId } = req.body;

  try {
    const queue = await prisma.queue.update({
      where: { id: queueId },
      data: {
        name,
        priority,
        concurrencyLimit,
        status,
        retryPolicyId,
      },
      include: { retryPolicy: true },
    });
    res.json(queue);
  } catch (err) {
    next(err);
  }
});

// DELETE /queues/:queueId
router.delete('/:queueId', requireQueueAccess, async (req, res, next) => {
  const { queueId } = req.params;
  try {
    await prisma.queue.delete({
      where: { id: queueId },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /queues/:queueId/stats
router.get('/:queueId/stats', requireQueueAccess, async (req, res, next) => {
  const { queueId } = req.params;

  try {
    // 1. Group jobs by status
    const statusCounts = await prisma.job.groupBy({
      by: ['status'],
      where: { queueId },
      _count: { _all: true },
    });

    const counts: Record<string, number> = {
      QUEUED: 0,
      SCHEDULED: 0,
      CLAIMED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      DEAD_LETTER: 0,
    };

    for (const group of statusCounts) {
      counts[group.status] = group._count._all;
    }

    // 2. Avg execution duration
    const avgDurationResult = await prisma.jobExecution.aggregate({
      where: {
        job: { queueId },
        status: 'SUCCESS',
      },
      _avg: { durationMs: true },
    });

    // 3. Throughput: Completed jobs in last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const completedLastHour = await prisma.job.count({
      where: {
        queueId,
        status: 'COMPLETED',
        updatedAt: { gte: oneHourAgo },
      },
    });

    // 4. Failure rate: FAILED + DEAD_LETTER vs total past executions in last 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const totalExecutionsLastDay = await prisma.jobExecution.count({
      where: {
        job: { queueId },
        startedAt: { gte: twentyFourHoursAgo },
      },
    });

    const failedExecutionsLastDay = await prisma.jobExecution.count({
      where: {
        job: { queueId },
        status: 'FAILURE',
        startedAt: { gte: twentyFourHoursAgo },
      },
    });

    const failureRate = totalExecutionsLastDay > 0
      ? (failedExecutionsLastDay / totalExecutionsLastDay) * 100
      : 0;

    res.json({
      counts,
      avgDurationMs: Math.round(avgDurationResult._avg.durationMs || 0),
      throughputHour: completedLastHour,
      failureRate24h: Math.round(failureRate * 10) / 10,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
