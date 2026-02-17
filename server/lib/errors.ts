import { Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';

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
 * - Other: log with stack, send generic 500 in production
 */
export function sendErrorResponse(res: Response, error: unknown): void {
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

  // Unexpected error: log full details, send generic message to client
  logger.error('Unhandled error:', error);
  if (error instanceof Error && error.stack && process.env.NODE_ENV !== 'production') {
    logger.error(error.stack);
  }
  res.status(500).json({ error: 'Internal server error' });
}
