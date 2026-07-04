import { z } from 'zod';
import { QueueStatus } from '@prisma/client';

export const createQueueSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Invalid Project ID format'),
    name: z.string().min(1, 'Queue name is required'),
    priority: z.number().int().min(0).max(100).default(0),
    concurrencyLimit: z.number().int().min(1).max(1000).default(5),
    retryPolicyId: z.string().uuid('Invalid Retry Policy ID format').nullable().optional(),
  }),
});

export const updateQueueSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    concurrencyLimit: z.number().int().min(1).max(1000).optional(),
    status: z.nativeEnum(QueueStatus).optional(),
    retryPolicyId: z.string().uuid('Invalid Retry Policy ID format').nullable().optional(),
  }),
});
