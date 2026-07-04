import { sendEmailHandler } from './sendEmail.js';
import { processImageHandler } from './processImage.js';
import { generateReportHandler } from './generateReport.js';

export type JobHandler = (payload: any, writeLog: (msg: string, lvl?: 'INFO' | 'WARN' | 'ERROR') => Promise<void>) => Promise<any>;

const registry: Record<string, JobHandler> = {
  'send-email': sendEmailHandler,
  'process-image': processImageHandler,
  'generate-report': generateReportHandler,
};

export function getHandler(type: string): JobHandler | null {
  return registry[type] || null;
}

export function registerHandler(type: string, handler: JobHandler) {
  registry[type] = handler;
}

export default registry;
