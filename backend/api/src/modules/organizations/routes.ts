import { Router } from 'express';
import { prisma } from 'database';
import { authenticate, requireOrgMember } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createOrgSchema, addMemberSchema } from './schema.js';

const router = Router();

// GET /organizations
router.get('/', authenticate, async (req, res, next) => {
  if (!req.user) return;
  try {
    const memberships = await prisma.orgMembership.findMany({
      where: { userId: req.user.id },
      include: { organization: true },
    });
    res.json(memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
      createdAt: m.organization.createdAt,
    })));
  } catch (err) {
    next(err);
  }
});

// POST /organizations
router.post('/', authenticate, validate(createOrgSchema), async (req, res, next) => {
  if (!req.user) return;
  const { name } = req.body;

  try {
    const org = await prisma.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: { name },
      });

      await tx.orgMembership.create({
        data: {
          userId: req.user!.id,
          orgId: newOrg.id,
          role: 'ADMIN',
        },
      });

      return newOrg;
    });

    res.status(201).json(org);
  } catch (err) {
    next(err);
  }
});

// GET /organizations/:orgId/members
router.get('/:orgId/members', authenticate, requireOrgMember(), async (req, res, next) => {
  const { orgId } = req.params;
  try {
    const members = await prisma.orgMembership.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.json(members.map(m => ({
      userId: m.userId,
      role: m.role,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.createdAt,
    })));
  } catch (err) {
    next(err);
  }
});

// POST /organizations/:orgId/members
router.post('/:orgId/members', authenticate, requireOrgMember('ADMIN'), validate(addMemberSchema), async (req, res, next) => {
  const { orgId } = req.params;
  const { email, role } = req.body;

  try {
    const targetUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!targetUser) {
      res.status(404).json({ error: { message: 'User with this email not found', code: 'USER_NOT_FOUND' } });
      return;
    }

    const existingMembership = await prisma.orgMembership.findUnique({
      where: {
        userId_orgId: {
          userId: targetUser.id,
          orgId,
        },
      },
    });

    if (existingMembership) {
      res.status(409).json({ error: { message: 'User is already a member of this organization', code: 'MEMBER_EXISTS' } });
      return;
    }

    const membership = await prisma.orgMembership.create({
      data: {
        userId: targetUser.id,
        orgId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    res.status(201).json({
      userId: membership.userId,
      role: membership.role,
      name: membership.user.name,
      email: membership.user.email,
      joinedAt: membership.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
