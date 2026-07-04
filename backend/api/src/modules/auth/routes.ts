import { Router } from 'express';
import { prisma } from 'database';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { registerSchema, loginSchema, refreshSchema } from './schema.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from './service.js';

const router = Router();

// POST /auth/register
router.post('/register', validate(registerSchema), async (req, res, next) => {
  const { email, password, name } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: { message: 'Email already registered', code: 'EMAIL_EXISTS' } });
      return;
    }

    const passwordHash = await hashPassword(password);

    // Create user, organization, and org membership in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
        },
      });

      const org = await tx.organization.create({
        data: {
          name: `${name}'s Organization`,
        },
      });

      await tx.orgMembership.create({
        data: {
          userId: user.id,
          orgId: org.id,
          role: 'ADMIN',
        },
      });

      return { user, org };
    });

    const tokenPayload = { userId: result.user.id, email: result.user.email };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', validate(loginSchema), async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' } });
      return;
    }

    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Select the first organization as active for convenience
    const activeOrg = user.memberships[0]?.organization || null;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: activeOrg
        ? {
            id: activeOrg.id,
            name: activeOrg.name,
          }
        : null,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  const { refreshToken } = req.body;

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user) {
      res.status(401).json({ error: { message: 'User not found', code: 'UNAUTHORIZED' } });
      return;
    }

    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(tokenPayload);

    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: { message: 'Invalid or expired refresh token', code: 'UNAUTHORIZED' } });
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: { message: 'Unauthenticated', code: 'UNAUTHORIZED' } });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
