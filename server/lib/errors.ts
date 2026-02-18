import { Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";

/** Request with optional requestId set by observability middleware */
type RequestWithId = Request & { requestId?: string };

/** Business/validation error with a safe message to send to the client. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
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
export function sendErrorResponse(
  res: Response,
  error: unknown,
  req?: RequestWithId,
): void {
  if (isAppError(error)) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.code && { code: error.code }),
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: error.errors });
    return;
  }

  // Prisma known request errors → client-friendly status and message (avoid generic 500).
  // Require code Pxxxx; accept with optional meta or other Prisma markers (name, clientVersion) so real Prisma errors without meta are still mapped.
  const err = error as {
    code?: string;
    meta?: unknown;
    name?: string;
    clientVersion?: string;
  };
  const code = err?.code;
  const hasPrismaShape =
    error &&
    typeof error === "object" &&
    typeof code === "string" &&
    /^P\d{4}$/.test(code) &&
    ("meta" in (error as object) ||
      err.name === "PrismaClientKnownRequestError" ||
      typeof err.clientVersion === "string");
  if (hasPrismaShape && code) {
    if (code === "P2002") {
      res
        .status(409)
        .json({
          error: "A record with this value already exists.",
          code: "CONFLICT",
        });
      return;
    }
    // API convention: FK / constraint violations → 400 (invalid payload or bad reference).
    if (code === "P2003") {
      res
        .status(400)
        .json({
          error: "Referenced record not found or constraint violation.",
          code: "CONSTRAINT",
        });
      return;
    }
    if (code === "P2025") {
      res.status(404).json({ error: "Record not found.", code: "NOT_FOUND" });
      return;
    }
  }

  // Unexpected error: structured log for prod/SIEM; stack only in non-prod
  const message = error instanceof Error ? error.message : String(error);
  const stack =
    error instanceof Error &&
    error.stack &&
    process.env.NODE_ENV !== "production"
      ? error.stack
      : undefined;
  logger.structured("error", {
    event: "unhandled_error",
    message,
    ...(req?.requestId && { requestId: req.requestId }),
    ...(req?.method && { method: req.method }),
    ...(req?.path && { path: req.path }),
    ...(stack && { stack }),
  });
  res.status(500).json({ error: "Internal server error" });
}
