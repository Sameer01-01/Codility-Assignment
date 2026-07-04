import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    orgId: z.string().uuid('Invalid Organization ID format'),
    name: z.string().min(1, 'Project name is required'),
    description: z.string().optional(),
  }),
});

export const updateProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Project name is required').optional(),
    description: z.string().optional(),
  }),
});
