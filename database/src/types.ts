import { JobStatus, WorkerStatus } from '@prisma/client';

export interface JobStatusChangedPayload {
  jobId: string;
  status: JobStatus;
  attempts: number;
  runAt: Date;
  queueId: string;
  workerId?: string | null;
  error?: string | null;
}

export interface WorkerHeartbeatPayload {
  workerId: string;
  hostname: string;
  pid: number;
  status: WorkerStatus;
  currentLoad: number;
  timestamp: Date;
}
