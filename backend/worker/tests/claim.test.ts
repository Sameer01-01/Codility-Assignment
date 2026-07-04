import { describe, it, expect, vi } from 'vitest';
import { claimJobs } from '../src/claim.js';
import { prisma } from 'database';
import { redis } from '../src/redis.js';

vi.mock('database', () => {
  const mockPrisma = {
    queue: {
      findMany: vi.fn(),
    },
    job: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
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

vi.mock('../src/redis.js', () => {
  return {
    redis: {
      get: vi.fn(),
      incrby: vi.fn(),
      decr: vi.fn(),
      set: vi.fn(),
    },
  };
});

describe('Atomic Claiming and Concurrency Limits', () => {
  it('respects queue concurrency limits', async () => {
    // Queue limit = 5, in-flight = 5 (no slots)
    vi.mocked(prisma.queue.findMany).mockResolvedValueOnce([
      { id: 'q1', concurrencyLimit: 5 } as any,
    ]);
    vi.mocked(redis.get).mockResolvedValueOnce('5'); // 5 in flight

    const claimed = await claimJobs('worker-1');

    expect(claimed).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('runs transaction to claim jobs when slots are available', async () => {
    // Queue limit = 5, in-flight = 3 (2 slots)
    vi.mocked(prisma.queue.findMany).mockResolvedValueOnce([
      { id: 'q1', concurrencyLimit: 5 } as any,
    ]);
    vi.mocked(redis.get).mockResolvedValueOnce('3');

    // Mock transaction result
    const mockJob = { id: 'job-1', queueId: 'q1', status: 'QUEUED' };
    vi.mocked(prisma.$transaction).mockResolvedValueOnce([mockJob]);

    const claimed = await claimJobs('worker-1');

    expect(claimed).toEqual([mockJob]);
    expect(redis.incrby).toHaveBeenCalledWith('in_flight:queue:q1', 1);
  });

  it('asserts that only one worker wins a claiming race condition (mocked database concurrency lock)', async () => {
    // Imagine two threads trying to lock the database:
    // We mock that the database raw query returns the job to worker A, but for worker B it returns empty
    // because worker A's query locked the row (FOR UPDATE SKIP LOCKED)
    
    vi.mocked(prisma.queue.findMany).mockResolvedValue([
      { id: 'q1', concurrencyLimit: 5 } as any,
    ]);
    vi.mocked(redis.get).mockResolvedValue('0');

    // Worker A runs first and locks the job
    vi.mocked(prisma.$transaction)
      .mockImplementationOnce(async (callback) => {
        // Simulating Worker A's transaction callback
        const mockTx = {
          $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'job-1' }]),
          job: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vi.fn().mockResolvedValue([{ id: 'job-1', queueId: 'q1', status: 'CLAIMED' }]),
          },
        };
        return callback(mockTx as any);
      })
      .mockImplementationOnce(async (callback) => {
        // Simulating Worker B's transaction callback running concurrently/subsequently
        // It runs $queryRaw but returns empty because job-1 is locked or already claimed
        const mockTx = {
          $queryRaw: vi.fn().mockResolvedValueOnce([]),
          job: {
            updateMany: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
          },
        };
        return callback(mockTx as any);
      });

    // Spin up concurrent claims
    const [claimA, claimB] = await Promise.all([
      claimJobs('worker-A'),
      claimJobs('worker-B'),
    ]);

    // Assert that Worker A successfully claims the job
    expect(claimA).toHaveLength(1);
    expect(claimA[0].id).toBe('job-1');

    // Assert that Worker B gets nothing (race condition won by A)
    expect(claimB).toHaveLength(0);
  });
});
