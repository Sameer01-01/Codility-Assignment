import { Router } from 'express';
import { prisma } from 'database';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// GET /workers (List registered workers and status)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const workers = await prisma.worker.findMany({
      include: {
        heartbeats: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
      },
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    res.json(workers.map((w) => {
      // Determine if stale
      const STALE_TIMEOUT = parseInt(process.env.STALE_WORKER_TIMEOUT_MS || '15000');
      const isStale = Date.now() - w.lastHeartbeatAt.getTime() > STALE_TIMEOUT;
      
      return {
        id: w.id,
        hostname: w.hostname,
        pid: w.pid,
        status: isStale ? 'OFFLINE' : w.status,
        lastHeartbeatAt: w.lastHeartbeatAt,
        startedAt: w.startedAt,
        heartbeats: w.heartbeats,
      };
    }));
  } catch (err) {
    next(err);
  }
});

export default router;
