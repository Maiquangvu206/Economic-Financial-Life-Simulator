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

  // Lỗi parse/body từ express/body-parser, JSON sai, payload quá lớn, v.v.
  const httpErr = error as { status?: number; statusCode?: number; type?: string; expose?: boolean; message?: string };
  const status = Number(httpErr?.statusCode ?? httpErr?.status ?? 0);
  if (status >= 400 && status < 500) {
    const isJsonParse = httpErr?.type === 'entity.parse.failed' || /JSON/i.test(httpErr?.message ?? '');
    const detail = httpErr?.expose ? httpErr.message : isJsonParse ? 'Dữ liệu gửi lên không hợp lệ (JSON).' : 'Yêu cầu không hợp lệ.';
    res.status(status).json({
      type: `https://efls.game/errors/http_${status}`,
      title: status === 400 ? 'Bad request' : status === 413 ? 'Payload too large' : 'Request error',
      status,
      detail,
      code: isJsonParse ? 'invalid_json' : 'bad_request',
      requestId,
    });
    return;
  }

  logger.error({ err: error, requestId }, 'Unhandled error');
  res.status(500).json({
    type: 'https://efls.game/errors/internal',
    title: 'Lỗi hệ thống',
    status: 500,
    detail: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
    code: 'internal_error',
    requestId,
  });
}
