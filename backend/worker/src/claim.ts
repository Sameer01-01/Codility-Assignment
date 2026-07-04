import { prisma, logger, Job } from 'database';
import { redis } from './redis.js';

/**
 * Claims jobs for a worker while respecting queue concurrency limits.
 * Uses SELECT FOR UPDATE SKIP LOCKED.
 * 
 * @param workerId ID of the claiming worker
 * @returns Array of claimed jobs
 */
export async function claimJobs(workerId: string): Promise<Job[]> {
  try {
    // 1. Get all active queues
    const queues = await prisma.queue.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, concurrencyLimit: true },
    });

    const claimedJobs: Job[] = [];

    // Process each queue
    for (const queue of queues) {
      // 2. Query current in-flight job count in Redis
      const inFlightKey = `in_flight:queue:${queue.id}`;
      const inFlightRaw = await redis.get(inFlightKey);
      const inFlightCount = inFlightRaw ? parseInt(inFlightRaw, 10) : 0;

      const slots = queue.concurrencyLimit - inFlightCount;
      if (slots <= 0) {
        continue; // No slots available for this queue
      }

      // 3. Claim jobs in Postgres transaction using FOR UPDATE SKIP LOCKED
      const queueJobs = await prisma.$transaction(async (tx) => {
        // Query ids of eligible jobs
        const eligibleJobs: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM "Job"
          WHERE "queueId" = ${queue.id}
            AND "status" IN ('QUEUED', 'SCHEDULED')
            AND "runAt" <= NOW()
          ORDER BY "priority" DESC, "runAt" ASC, "createdAt" ASC
          LIMIT ${slots}
          FOR UPDATE SKIP LOCKED;
        `;

        if (eligibleJobs.length === 0) {
          return [];
        }

        const ids = eligibleJobs.map((j) => j.id);

        // Update status to CLAIMED
        await tx.job.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'CLAIMED',
            claimedByWorkerId: workerId,
            claimedAt: new Date(),
          },
        });

        // Fetch and return the updated job records
        return tx.job.findMany({
          where: { id: { in: ids } },
        });
      });

      if (queueJobs.length > 0) {
        // 4. Increment in-flight count in Redis
        await redis.incrby(inFlightKey, queueJobs.length);
        
        claimedJobs.push(...queueJobs);
        
        logger.info(
          { queueId: queue.id, count: queueJobs.length },
          `Claimed ${queueJobs.length} jobs for queue`
        );
      }
    }

    return claimedJobs;
  } catch (err) {
    logger.error(err, 'Error during job claiming process');
    return [];
  }
}
