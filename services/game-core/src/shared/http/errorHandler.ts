import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';
import { AppError } from './errors.js';

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = typeof req.id === 'string' ? req.id : undefined;

  if (error instanceof ZodError) {
    res.status(422).json({
      type: 'https://efls.game/errors/validation',
      title: 'Validation failed',
      status: 422,
      code: 'validation_error',
      requestId,
      errors: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      type: `https://efls.game/errors/${error.code}`,
      title: error.title,
      status: error.status,
      detail: error.detail,
      code: error.code,
      requestId,
    });
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled error');
  res.status(500).json({
    type: 'https://efls.game/errors/internal',
    title: 'Internal server error',
    status: 500,
    code: 'internal_error',
    requestId,
  });
}
