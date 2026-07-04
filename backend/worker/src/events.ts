import { redis } from './redis.js';
import { logger } from 'database';

export async function publishJobStatus(projectId: string, payload: any) {
  try {
    await redis.publish(
      'job:status_changed',
      JSON.stringify({ projectId, ...payload })
    );
  } catch (err) {
    logger.error(err, 'Failed to publish job status event to Redis');
  }
}

export async function publishWorkerHeartbeat(payload: any) {
  try {
    await redis.publish('worker:heartbeat', JSON.stringify(payload));
  } catch (err) {
    logger.error(err, 'Failed to publish worker heartbeat event to Redis');
  }
}
