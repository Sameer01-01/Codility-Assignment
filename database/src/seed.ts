import bcrypt from 'bcrypt';
import { prisma, logger } from './index.js';

async function seed() {
  logger.info('Seeding database with demo data...');

  try {
    // 1. Create Demo User
    const email = 'admin@example.com';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      logger.info('Demo user already exists, skipping seed.');
      return;
    }

    const passwordHash = await bcrypt.hash('admin123', 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: 'Demo Admin',
      },
    });

    // 2. Create Organization
    const org = await prisma.organization.create({
      data: {
        name: 'Acme Corp',
      },
    });

    // 3. Create Org Membership
    await prisma.orgMembership.create({
      data: {
        userId: user.id,
        orgId: org.id,
        role: 'ADMIN',
      },
    });

    // 4. Create Project
    const project = await prisma.project.create({
      data: {
        orgId: org.id,
        name: 'Logistics Automation',
        description: 'Asynchronous pipeline for processing image receipts, compiles sales reports, and sends user notification emails.',
      },
    });

    // 5. Create Retry Policy
    const retryPolicy = await prisma.retryPolicy.create({
      data: {
        name: 'Exponential Retry Policy',
        strategy: 'EXPONENTIAL',
        baseDelayMs: 2000,
        maxRetries: 5,
        maxDelayMs: 30000,
      },
    });

    // 6. Create Queues
    const imageQueue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: 'image-processing-queue',
        priority: 10,
        concurrencyLimit: 3,
        retryPolicyId: retryPolicy.id,
      },
    });

    const emailQueue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: 'email-dispatch-queue',
        priority: 5,
        concurrencyLimit: 5,
        retryPolicyId: retryPolicy.id,
      },
    });

    const reportQueue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: 'report-generation-queue',
        priority: 2,
        concurrencyLimit: 2,
        retryPolicyId: retryPolicy.id,
      },
    });

    // 7. Seed Sample Jobs
    // Immediate send-email jobs
    await prisma.job.create({
      data: {
        queueId: emailQueue.id,
        type: 'send-email',
        payload: { to: 'customer@acme.com', subject: 'Invoice #1092', body: 'Please find attached invoice details.' },
        priority: 5,
        status: 'QUEUED',
        runAt: new Date(),
      },
    });

    await prisma.job.create({
      data: {
        queueId: emailQueue.id,
        type: 'send-email',
        payload: { to: 'marketing@acme.com', subject: 'Welcome onboard!', body: 'Thank you for choosing Logistics Automation.' },
        priority: 3,
        status: 'QUEUED',
        runAt: new Date(),
      },
    });

    // Delayed processing
    await prisma.job.create({
      data: {
        queueId: imageQueue.id,
        type: 'process-image',
        payload: { imageUrl: 'https://cdn.acme.com/receipts/0091.jpg', width: 800, height: 600, format: 'webp' },
        priority: 10,
        status: 'SCHEDULED',
        runAt: new Date(Date.now() + 60000), // 1 minute from now
      },
    });

    // Recurring (Cron) job
    await prisma.job.create({
      data: {
        queueId: reportQueue.id,
        type: 'generate-report',
        payload: { reportType: 'SALES', recipientEmail: 'ceo@acme.com', filters: { date: 'last-month' } },
        priority: 2,
        status: 'SCHEDULED',
        runAt: new Date(Date.now() + 5000), // 5 seconds from now
        cronExpression: '*/5 * * * *', // every 5 minutes
      },
    });

    // Stuck / Failed jobs for testing retry
    const failedJob = await prisma.job.create({
      data: {
        queueId: imageQueue.id,
        type: 'process-image',
        payload: { imageUrl: 'https://cdn.acme.com/receipts/corrupted.jpg', width: 100, height: 100, format: 'png' },
        priority: 5,
        status: 'FAILED',
        attempts: 3,
        maxAttempts: 3,
        runAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });

    await prisma.jobLog.create({
      data: {
        jobId: failedJob.id,
        level: 'ERROR',
        message: 'Image parsing failed: Magic bytes missing',
      },
    });

    // Dead Letter Queue entry
    const dlqJob = await prisma.job.create({
      data: {
        queueId: emailQueue.id,
        type: 'send-email',
        payload: { to: 'invalid-email-dns.com', subject: 'Urgent notification', body: 'SMTP server rejected host address.' },
        priority: 1,
        status: 'DEAD_LETTER',
        attempts: 5,
        maxAttempts: 5,
        runAt: new Date(Date.now() - 7200000),
      },
    });

    await prisma.deadLetterEntry.create({
      data: {
        jobId: dlqJob.id,
        reason: 'SMTP connection failed: Host lookup unresolved',
        originalPayload: dlqJob.payload as any,
      },
    });

    // Batch jobs
    const batchId = crypto.randomUUID();
    await prisma.job.create({
      data: {
        queueId: emailQueue.id,
        type: 'send-email',
        payload: { to: 'user1@acme.com', subject: 'Newsletter #1', body: 'Batch delivery' },
        status: 'QUEUED',
        batchId,
      },
    });

    await prisma.job.create({
      data: {
        queueId: emailQueue.id,
        type: 'send-email',
        payload: { to: 'user2@acme.com', subject: 'Newsletter #2', body: 'Batch delivery' },
        status: 'QUEUED',
        batchId,
      },
    });

    logger.info('Database seeded successfully.');
  } catch (err) {
    logger.error(err, 'Failed to seed database');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
