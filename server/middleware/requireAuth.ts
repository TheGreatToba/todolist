import { RequestHandler, Request, Response } from "express";
import { extractToken, verifyToken, JwtPayload, Role } from "../lib/auth";

/**
 * Middleware: require valid JWT (from Authorization header or cookie).
 * Sets req.auth with the decoded payload. Responds 401 if missing or invalid.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  req.auth = payload;
  next();
};

/**
 * Middleware: require a specific role. Use after requireAuth.
 * Typed with Role union to avoid typos.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  const set = new Set<Role>(roles);
  return (req, res, next) => {
    const payload = req.auth;
    if (!payload) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!set.has(payload.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/**
 * Returns req.auth or sends 401 and returns null. Use in handlers after requireAuth
 * to avoid non-null assertions and make tests easier (mock req.auth).
 */
export function getAuthOrThrow(req: Request, res: Response): JwtPayload | null {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.auth;
}
