import { RequestHandler } from 'express';
import { extractToken, verifyToken } from '../lib/auth';

/**
 * Middleware: require valid JWT (from Authorization header or cookie).
 * Sets req.auth with the decoded payload. Responds 401 if missing or invalid.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  req.auth = payload;
  next();
};

/**
 * Middleware: require a specific role. Use after requireAuth.
 * Responds 403 if req.auth.role is not in the allowed list.
 */
export function requireRole(...roles: string[]): RequestHandler {
  const set = new Set(roles);
  return (req, res, next) => {
    const payload = req.auth;
    if (!payload) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!set.has(payload.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}
