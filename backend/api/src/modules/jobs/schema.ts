import { z } from 'zod';

export const createJobSchema = z.object({
  body: z.object({
    queueId: z.string().uuid('Invalid Queue ID format'),
    type: z.string().min(1, 'Job type is required'),
    payload: z.any().default({}),
    priority: z.number().int().default(0),
    idempotencyKey: z.string().optional(),
    delayMs: z.number().int().nonnegative().optional(),
    runAt: z.string().datetime({ precision: 3 }).optional(), // ISO string
    cronExpression: z.string().optional(),
  }),
});

export const createBatchJobsSchema = z.object({
  body: z.object({
    queueId: z.string().uuid('Invalid Queue ID format'),
    jobs: z.array(
      z.object({
        type: z.string().min(1, 'Job type is required'),
        payload: z.any().default({}),
        priority: z.number().int().default(0),
        idempotencyKey: z.string().optional(),
        delayMs: z.number().int().nonnegative().optional(),
        runAt: z.string().datetime({ precision: 3 }).optional(),
      })
    ).min(1, 'Batch must contain at least 1 job'),
  }),
});
