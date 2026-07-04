import { logger } from 'database';

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

export async function sendEmailHandler(payload: EmailPayload, writeLog: (msg: string, lvl?: 'INFO' | 'WARN' | 'ERROR') => Promise<void>): Promise<any> {
  await writeLog(`Starting sendEmail task for: ${payload.to}`, 'INFO');
  
  // Simulate delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Random failure (20% rate)
  if (Math.random() < 0.20) {
    await writeLog('Failed to connect to SMTP server: Timeout', 'ERROR');
    throw new Error('SMTP connection timed out');
  }

  await writeLog(`Successfully sent email "${payload.subject}" to ${payload.to}`, 'INFO');
  return { status: 'sent', messageId: `msg_${Math.floor(Math.random() * 1000000)}` };
}
export default sendEmailHandler;
