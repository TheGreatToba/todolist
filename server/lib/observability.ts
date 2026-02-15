import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/** Priority order for correlation headers (proxy/APM). First found wins. HTTP names are case-insensitive. */
const CORRELATION_HEADERS = ['x-request-id', 'x-correlation-id', 'x-amzn-trace-id'] as const;

const RESPONSE_HEADER = 'X-Request-ID';

/** Extract or generate request ID. Standardised for cross-service tracing. */
function resolveRequestId(req: Request): string {
  for (const name of CORRELATION_HEADERS) {
    const value = req.headers[name];
    if (value) {
      const id = typeof value === 'string' ? value : value[0] || '';
      if (id) return id;
    }
  }
  return crypto.randomUUID();
}

/** Middleware: set req.requestId, add X-Request-ID to response. Run early. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req);
  req.requestId = requestId;
  res.setHeader(RESPONSE_HEADER, requestId);
  next();
}
