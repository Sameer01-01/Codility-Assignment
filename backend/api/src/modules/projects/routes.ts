import { Router } from 'express';
import { prisma } from 'database';
import { authenticate, requireOrgMember, requireProjectMember } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createProjectSchema, updateProjectSchema } from './schema.js';

const router = Router();

// GET /projects
router.get('/', authenticate, async (req, res, next) => {
  if (!req.user) return;
  const orgId = req.query.orgId as string;

  if (!orgId) {
    res.status(400).json({ error: { message: 'orgId query parameter is required', code: 'BAD_REQUEST' } });
    return;
  }

  try {
    // Authenticate org membership
    const membership = await prisma.orgMembership.findUnique({
      where: {
        userId_orgId: {
          userId: req.user.id,
          orgId,
        },
      },
    });

    if (!membership) {
      res.status(403).json({ error: { message: 'Forbidden: Access denied', code: 'FORBIDDEN' } });
      return;
    }

    const projects = await prisma.project.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (err) {
    next(err);
  }
});

// POST /projects
router.post('/', authenticate, requireOrgMember(), validate(createProjectSchema), async (req, res, next) => {
  const { orgId, name, description } = req.body;

  try {
    const project = await prisma.project.create({
      data: {
        orgId,
        name,
        description,
      },
    });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:projectId
router.get('/:projectId', authenticate, requireProjectMember(), async (req, res, next) => {
  const { projectId } = req.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        queues: {
          select: {
            id: true,
            name: true,
            status: true,
            priority: true,
            concurrencyLimit: true,
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: { message: 'Project not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json(project);
  } catch (err) {
    next(err);
  }
});

// PUT /projects/:projectId
router.put('/:projectId', authenticate, requireProjectMember(), validate(updateProjectSchema), async (req, res, next) => {
  const { projectId } = req.params;
  const { name, description } = req.body;

  try {
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        name,
        description,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /projects/:projectId
router.delete('/:projectId', authenticate, requireProjectMember(), async (req, res, next) => {
  const { projectId } = req.params;

  try {
    await prisma.project.delete({
      where: { id: projectId },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
