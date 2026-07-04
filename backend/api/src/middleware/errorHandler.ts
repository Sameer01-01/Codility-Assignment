import { Request, Response, NextFunction } from 'express';
import { logger } from 'database';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  logger.error(err, 'Unhandled request error');

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      details: err.details || undefined,
    },
  });
}
