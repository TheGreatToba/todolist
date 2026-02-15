import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { parse as parseCookie } from 'cookie';

let _jwtSecret: string | null = null;

function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error(
      'JWT_SECRET is required. Set it in your environment (e.g. .env file) before starting the server.'
    );
  }
  _jwtSecret = secret;
  return _jwtSecret;
}

/** Call at server startup to fail fast if JWT_SECRET is missing. */
export function ensureAuthConfig(): void {
  getJwtSecret();
}

const JWT_EXPIRY = '7d';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_NAME = 'token';

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Cookie options for set and clear - must match for clearCookie to work across browsers/proxies */
export function getAuthCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

/** Options for clearCookie - must mirror getAuthCookieOptions (excluding maxAge) */
export function getAuthCookieClearOptions(): { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string } {
  const opts = getAuthCookieOptions();
  return {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  };
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/** Extract JWT from Authorization header (Bearer) or from httpOnly cookie */
export function extractToken(req: { headers?: { authorization?: string; cookie?: string }; cookies?: Record<string, string> }): string | null {
  const fromHeader = extractTokenFromHeader(req.headers?.authorization);
  if (fromHeader) return fromHeader;

  if (req.cookies?.[AUTH_COOKIE_NAME]) {
    return req.cookies[AUTH_COOKIE_NAME];
  }

  if (req.headers?.cookie) {
    const parsed = parseCookie(req.headers.cookie);
    return parsed[AUTH_COOKIE_NAME] ?? null;
  }

  return null;
}
