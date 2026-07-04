import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from 'database';

vi.mock('database', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      create: vi.fn(),
    },
    orgMembership: {
      create: vi.fn(),
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

describe('Auth Flow Endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('POST /auth/register - successfully registers new user and returns tokens', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null); // email not registered
    
    const mockUser = { id: 'u1', email: 'test@example.com', name: 'Tester' };
    const mockOrg = { id: 'o1', name: "Tester's Organization" };

    // Transaction mock returns user and org
    vi.mocked(prisma.$transaction).mockResolvedValueOnce({
      user: mockUser,
      org: mockOrg,
    });

    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        name: 'Tester',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
    expect(response.body.user.email).toBe('test@example.com');
  });

  it('POST /auth/register - fails if validation rules are violated', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'invalid-email',
        password: '123', // less than 6 chars
        name: '',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
