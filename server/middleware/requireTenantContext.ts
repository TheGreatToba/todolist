import { Request, RequestHandler, Response } from "express";
import { sendErrorResponse } from "../lib/errors";
import { loadTenantContextFromAuth } from "../security/tenant-context";
import type { TenantContext } from "../security/tenant-context";

/**
 * Requires req.auth (set by requireAuth) and enriches request with tenant scope.
 * Team IDs are loaded once per request and reused by handlers.
 */
export const requireTenantContext: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    req.tenant = await loadTenantContextFromAuth(req.auth);
    next();
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

/**
 * Returns req.tenant or sends 401 and returns null.
 */
export function getTenantOrThrow(
  req: Request,
  res: Response,
): TenantContext | null {
  if (!req.tenant) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.tenant;
}
