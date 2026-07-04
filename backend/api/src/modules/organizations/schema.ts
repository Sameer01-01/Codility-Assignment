import { z } from 'zod';
import { Role } from '@prisma/client';

export const createOrgSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Organization name is required'),
  }),
});

export const addMemberSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    role: z.nativeEnum(Role).default(Role.MEMBER),
  }),
});
