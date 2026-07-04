import { Redis } from 'ioredis';
import { logger } from 'database';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err: any) => {
  logger.error(err, 'Redis connection error');
});

export default redis;
