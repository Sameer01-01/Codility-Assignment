import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from 'database';

// Extend Express Request type to include user properties
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-signing-key-change-in-production';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { message: 'Authorization token missing or invalid', code: 'UNAUTHORIZED' }
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    req.user = {
      id: payload.userId,
      email: payload.email,
    };
    next();
  } catch (err) {
    res.status(401).json({
      error: { message: 'Invalid or expired authorization token', code: 'UNAUTHORIZED' }
    });
  }
}

export function requireOrgMember(role?: 'ADMIN' | 'MEMBER') {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthenticated', code: 'UNAUTHORIZED' } });
      return;
    }

    const orgId = req.params.orgId || req.body.orgId;
    if (!orgId) {
      res.status(400).json({ error: { message: 'Organization ID is required', code: 'BAD_REQUEST' } });
      return;
    }

    try {
      const membership = await prisma.orgMembership.findUnique({
        where: {
          userId_orgId: {
            userId: req.user.id,
            orgId: orgId,
          },
        },
      });

      if (!membership) {
        res.status(403).json({
          error: { message: 'Forbidden: You are not a member of this organization', code: 'FORBIDDEN' }
        });
        return;
      }

      if (role && role === 'ADMIN' && membership.role !== 'ADMIN') {
        res.status(403).json({
          error: { message: 'Forbidden: Admin access required', code: 'FORBIDDEN' }
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireProjectMember() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthenticated', code: 'UNAUTHORIZED' } });
      return;
    }

    const projectId = req.params.projectId || req.body.projectId;
    if (!projectId) {
      res.status(400).json({ error: { message: 'Project ID is required', code: 'BAD_REQUEST' } });
      return;
    }

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { orgId: true },
      });

      if (!project) {
        res.status(404).json({ error: { message: 'Project not found', code: 'NOT_FOUND' } });
        return;
      }

      const membership = await prisma.orgMembership.findUnique({
        where: {
          userId_orgId: {
            userId: req.user.id,
            orgId: project.orgId,
          },
        },
      });

      if (!membership) {
        res.status(403).json({
          error: { message: 'Forbidden: You do not have access to this project', code: 'FORBIDDEN' }
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
