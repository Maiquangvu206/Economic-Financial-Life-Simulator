import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wrap async handlers so Express 4 forwards rejections to the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}
