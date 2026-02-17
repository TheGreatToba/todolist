import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';

/** Request with optional requestId set by observability middleware */
type RequestWithId = Request & { requestId?: string };

/** Business/validation error with a safe message to send to the client. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Send error response and optionally log. Use in route catch blocks:
 * - AppError: send status + message (no stack to client)
 * - ZodError: 400 with details (instanceof for robustness)
 * - Other: log structured event (SIEM/observability); send generic 500 to client in all environments
 * @param req Optional request for structured log correlation (requestId, method, path)
 */
export function sendErrorResponse(res: Response, error: unknown, req?: RequestWithId): void {
  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.code && { code: error.code }),
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', details: error.errors });
    return;
  }

  // Unexpected error: structured log for prod/SIEM; stack only in non-prod
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack && process.env.NODE_ENV !== 'production' ? error.stack : undefined;
  logger.structured('error', {
    event: 'unhandled_error',
    message,
    ...(req?.requestId && { requestId: req.requestId }),
    ...(req?.method && { method: req.method }),
    ...(req?.path && { path: req.path }),
    ...(stack && { stack }),
  });
  res.status(500).json({ error: 'Internal server error' });
}
