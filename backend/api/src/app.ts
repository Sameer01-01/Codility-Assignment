import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/routes.js';
import orgRoutes from './modules/organizations/routes.js';
import projectRoutes from './modules/projects/routes.js';
import queueRoutes from './modules/queues/routes.js';
import jobRoutes from './modules/jobs/routes.js';
import workerRoutes from './modules/workers/routes.js';

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// API Routes
app.use('/auth', authRoutes);
app.use('/organizations', orgRoutes);
app.use('/projects', projectRoutes);
app.use('/queues', queueRoutes);
app.use('/jobs', jobRoutes);
app.use('/workers', workerRoutes);

// Base Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.path}`,
      code: 'NOT_FOUND',
    },
  });
});

// Error handling middleware
app.use(errorHandler);

export { app };
export default app;
