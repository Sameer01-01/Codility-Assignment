export interface ImagePayload {
  imageUrl: string;
  format: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
}

export async function processImageHandler(payload: ImagePayload, writeLog: (msg: string, lvl?: 'INFO' | 'WARN' | 'ERROR') => Promise<void>): Promise<any> {
  await writeLog(`Resizing image: ${payload.imageUrl} to ${payload.width}x${payload.height} in ${payload.format} format`, 'INFO');

  // Simulate heavy processing
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Random failure (10% rate)
  if (Math.random() < 0.10) {
    await writeLog('Corrupted image payload: magic bytes missing', 'ERROR');
    throw new Error('Image parsing failed: Invalid structure');
  }

  await writeLog(`Successfully compressed and processed image to ${payload.format}`, 'INFO');
  return { status: 'processed', sizeBytes: Math.floor(Math.random() * 500000) };
}
export default processImageHandler;
