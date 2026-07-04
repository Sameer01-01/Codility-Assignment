export interface ReportPayload {
  reportType: 'SALES' | 'AUDIT' | 'USERS';
  filters: Record<string, any>;
  recipientEmail: string;
}

export async function generateReportHandler(payload: ReportPayload, writeLog: (msg: string, lvl?: 'INFO' | 'WARN' | 'ERROR') => Promise<void>): Promise<any> {
  await writeLog(`Generating ${payload.reportType} report for ${payload.recipientEmail}`, 'INFO');

  // Simulate long running report generation
  await new Promise((resolve) => setTimeout(resolve, 4000));

  // Random failure (15% rate)
  if (Math.random() < 0.15) {
    await writeLog('Database lock timeout occurred during aggregation queries', 'ERROR');
    throw new Error('Database transaction lock error: Timeout');
  }

  await writeLog(`${payload.reportType} report generated. Filesize: 4.2MB`, 'INFO');
  return { status: 'generated', reportUrl: `https://storage.cdn.scheduler/reports/${payload.reportType.toLowerCase()}_${Math.floor(Date.now())}.pdf` };
}
export default generateReportHandler;
