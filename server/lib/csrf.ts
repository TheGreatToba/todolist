import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { parse as parseCookie } from "cookie";
import { logger } from "./logger";

export const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

/** Skip CSRF validation in test env only. DISABLE_CSRF is forbidden in production. */
function isCsrfDisabled(): boolean {
  if (process.env.NODE_ENV === "test") return true;
  if (
    process.env.DISABLE_CSRF === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "DISABLE_CSRF=true is not allowed in production. Remove it.",
    );
  }
  return process.env.DISABLE_CSRF === "true";
}

/** Call at startup to fail fast if DISABLE_CSRF is misconfigured in production. */
export function ensureCsrfConfig(): void {
  isCsrfDisabled();
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getCsrfTokenFromCookie(req: Request): string | null {
  if (req.cookies?.[CSRF_COOKIE_NAME]) return req.cookies[CSRF_COOKIE_NAME];
  if (req.headers.cookie) {
    const parsed = parseCookie(req.headers.cookie);
    return parsed[CSRF_COOKIE_NAME] ?? null;
  }
  return null;
}

/** Set CSRF cookie on response if missing (so client can read it for double-submit) */
export function setCsrfCookieIfMissing(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isCsrfDisabled()) return next();

  const existing = getCsrfTokenFromCookie(req);
  if (!existing) {
    const token = generateCsrfToken();
    // In prod with HTTP-only (no HTTPS), set COOKIE_SECURE=false so browser sends cookie
    const secure =
      process.env.NODE_ENV === "production" &&
      process.env.COOKIE_SECURE !== "false";
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by JS for double-submit
      secure,
      sameSite: "lax",
      maxAge: CSRF_COOKIE_MAX_AGE_MS,
      path: "/",
    });
  }
  next();
}

const STATE_CHANGING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/** Validate CSRF token on state-changing requests. Exempt: set-password (uses one-time token in body) */
export function validateCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isCsrfDisabled()) return next();
  if (!STATE_CHANGING_METHODS.includes(req.method)) return next();

  // set-password uses one-time token in body, not session cookie.
  // Handle both forms: /api/auth/set-password and /auth/set-password (mounted router).
  const path = req.path;
  if (path === "/api/auth/set-password" || path === "/auth/set-password")
    return next();

  const headerToken = req.headers[CSRF_HEADER] as string | undefined;
  const cookieToken = getCsrfTokenFromCookie(req);

  if (!cookieToken || !headerToken || headerToken !== cookieToken) {
    // Structured log for ops/monitoring (no secrets). requestId correlates with proxy/APM.
    logger.structured("warn", {
      event: "csrf_rejected",
      requestId: req.requestId ?? crypto.randomUUID(),
      method: req.method,
      path: req.path,
      reason: !cookieToken
        ? "missing_cookie"
        : !headerToken
          ? "missing_header"
          : "mismatch",
    });
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  next();
}
