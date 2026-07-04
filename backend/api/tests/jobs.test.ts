import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from 'database';
import jwt from 'jsonwebtoken';

vi.mock('database', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
    orgMembership: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    queue: {
      findUnique: vi.fn(),
    },
    job: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  return {
    prisma: mockPrisma,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock('../../websocket/index.ts', () => {
  return {
    broadcastJobStatus: vi.fn(),
  };
});

describe('Jobs Submission Endpoints', () => {
  let token: string;
  const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-signing-key-change-in-production';

  beforeEach(() => {
    vi.resetAllMocks();
    token = jwt.sign({ userId: 'u1', email: 'test@example.com' }, JWT_SECRET);
  });

  it('POST /jobs - submits immediate job', async () => {
    const mockQueue = { id: 'q1', projectId: 'p1', status: 'ACTIVE' };
    vi.mocked(prisma.queue.findUnique).mockResolvedValue(mockQueue as any);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', orgId: 'o1' } as any);
    vi.mocked(prisma.orgMembership.findUnique).mockResolvedValue({ id: 'm1' } as any);

    const mockJob = { id: 'j1', queueId: 'q1', type: 'send-email', status: 'QUEUED', runAt: new Date() };
    vi.mocked(prisma.job.create).mockResolvedValue(mockJob as any);

    const response = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId: '00000000-0000-0000-0000-000000000000',
        type: 'send-email',
        payload: { to: 'user@example.com' },
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('QUEUED');
  });

  it('POST /jobs - submits delayed job', async () => {
    const mockQueue = { id: 'q1', projectId: 'p1', status: 'ACTIVE' };
    vi.mocked(prisma.queue.findUnique).mockResolvedValue(mockQueue as any);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', orgId: 'o1' } as any);
    vi.mocked(prisma.orgMembership.findUnique).mockResolvedValue({ id: 'm1' } as any);

    const mockJob = { id: 'j1', queueId: 'q1', type: 'send-email', status: 'SCHEDULED', runAt: new Date() };
    vi.mocked(prisma.job.create).mockResolvedValue(mockJob as any);

    const response = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId: '00000000-0000-0000-0000-000000000000',
        type: 'send-email',
        payload: { to: 'user@example.com' },
        delayMs: 5000,
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('SCHEDULED');
  });

  it('POST /jobs - submits cron recurring job', async () => {
    const mockQueue = { id: 'q1', projectId: 'p1', status: 'ACTIVE' };
    vi.mocked(prisma.queue.findUnique).mockResolvedValue(mockQueue as any);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', orgId: 'o1' } as any);
    vi.mocked(prisma.orgMembership.findUnique).mockResolvedValue({ id: 'm1' } as any);

    const mockJob = { id: 'j1', queueId: 'q1', type: 'send-email', status: 'SCHEDULED', cronExpression: '*/5 * * * *' };
    vi.mocked(prisma.job.create).mockResolvedValue(mockJob as any);

    const response = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId: '00000000-0000-0000-0000-000000000000',
        type: 'send-email',
        cronExpression: '*/5 * * * *',
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('SCHEDULED');
  });
});
