import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { parse as parseCookie } from "cookie";

let _jwtSecret: string | null = null;

function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error(
      "JWT_SECRET is required. Set it in your environment (e.g. .env file) before starting the server.",
    );
  }
  _jwtSecret = secret;
  return _jwtSecret;
}

/** Call at server startup to fail fast if JWT_SECRET is missing. */
export function ensureAuthConfig(): void {
  getJwtSecret();
}

const JWT_EXPIRY = "7d";

/** Role union for type-safe checks (avoids typos in requireRole). */
export type Role = "MANAGER" | "EMPLOYEE";

/** Runtime guard: ensures DB string is a valid role before emitting a JWT. */
export function isRole(value: unknown): value is Role {
  return value === "MANAGER" || value === "EMPLOYEE";
}

const JwtPayloadSchema = z
  .object({
    userId: z.string(),
    email: z.string().email(),
    role: z.enum(["MANAGER", "EMPLOYEE"]),
    iat: z.number().optional(),
    exp: z.number().optional(),
  })
  .strict();

/** Public JWT payload; shape aligned with JwtPayloadSchema (userId, email, role only). If it drifts, consider deriving from a dedicated "public claims" schema. */
export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

/** Hash a token using SHA-256 for secure storage */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Verify a token against a stored hash */
export function verifyTokenHash(token: string, hash: string): boolean {
  const tokenHash = hashToken(token);
  // Use constant-time comparison to prevent timing attacks
  // Both SHA-256 hashes are 64 hex characters = 32 bytes
  if (tokenHash.length !== hash.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(tokenHash, "hex"),
    Buffer.from(hash, "hex"),
  );
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const parsed = JwtPayloadSchema.safeParse(decoded);
    if (!parsed.success) return null;
    const { userId, email, role } = parsed.data;
    return { userId, email, role };
  } catch {
    return null;
  }
}

/** __Host- prefix in prod with HTTPS only; with HTTP (COOKIE_SECURE=false) use "token" */
export const AUTH_COOKIE_NAME =
  process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"
    ? "__Host-token"
    : "token";

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Cookie options for set and clear - must match for clearCookie to work across browsers/proxies */
export function getAuthCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" &&
      process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

/** Options for clearCookie - must mirror getAuthCookieOptions (excluding maxAge) */
export function getAuthCookieClearOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
} {
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
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

/** Extract JWT from Authorization header (Bearer) or from httpOnly cookie */
export function extractToken(req: {
  headers?: { authorization?: string; cookie?: string };
  cookies?: Record<string, string>;
}): string | null {
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
