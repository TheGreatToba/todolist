import { RequestHandler } from "express";
import { z } from "zod";
import crypto from "crypto";
import prisma from "../lib/db";
import { Request, Response } from "express";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  isRole,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  getAuthCookieClearOptions,
  hashToken,
} from "../lib/auth";
import { sendErrorResponse } from "../lib/errors";
import { redactEmailForLog, emailHashForLog } from "../lib/log-pii";
import { getAuthOrThrow } from "../middleware/requireAuth";
import { logger } from "../lib/logger";
import { sendPasswordResetEmail } from "../lib/email";
import { getPasswordResetTokenExpiryHours } from "../lib/password-reset-expiry";

/**
 * Structured log when role from DB is invalid (do not emit JWT).
 * In production, email is redacted (domain only) and emailHash allows correlation without PII.
 */
function logInvalidRole(
  user: { id: string; email: string; role: unknown },
  req: Request,
): void {
  const payload: Record<string, unknown> = {
    event: "invalid_role_rejected",
    userId: user.id,
    email: redactEmailForLog(user.email),
    role: user.role,
    endpoint: req.path,
    method: req.method,
    requestId: req.requestId ?? undefined,
  };
  const hash = emailHashForLog(user.email);
  if (hash) payload.emailHash = hash;
  logger.structured("warn", payload);
}

/** Safely extract Prisma P2002 meta.target as string array (no `as any`). */
function getP2002TargetFields(
  err: { meta?: unknown } | null | undefined,
): string[] {
  if (!err?.meta || typeof err.meta !== "object" || !("target" in err.meta))
    return [];
  const target = (err.meta as { target?: unknown }).target;
  if (!Array.isArray(target)) return [];
  return target.map((t) => String(t));
}

/** Returns JWT payload for cookie, or null after logging and sending 500. */
function createTokenOrFail(
  req: Request,
  res: Response,
  user: { id: string; email: string; role: unknown },
): string | null {
  if (!isRole(user.role)) {
    logInvalidRole(user, req);
    res.status(500).json({ error: "Invalid user role" });
    return null;
  }
  return generateToken({ userId: user.id, email: user.email, role: user.role });
}

const SetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const SignupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["MANAGER"]), // Only managers can signup directly
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const UpdateProfileSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.password !== undefined,
    "At least one field must be provided",
  );

export const handleSignup: RequestHandler = async (req, res) => {
  try {
    const body = SignupSchema.parse(req.body);

    const user = await prisma.$transaction(async (tx) => {
      // Hash password
      const passwordHash = await hashPassword(body.password);

      // Create user
      const createdUser = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash,
          role: body.role,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          teamId: true,
        },
      });

      // If manager, create a default team and attach it to the user
      if (body.role === "MANAGER") {
        const team = await tx.team.create({
          data: {
            name: `${body.name}'s Team`,
            managerId: createdUser.id,
          },
        });

        await tx.user.update({
          where: { id: createdUser.id },
          data: { teamId: team.id },
        });

        // Reflect the updated teamId in the returned object
        createdUser.teamId = team.id;
      }

      return createdUser;
    });

    const token = createTokenOrFail(req, res, user);
    if (!token) return;
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    res.status(201).json({ user });
  } catch (error) {
    // Let the DB unique constraint handle email races; present a domain-specific message.
    const prismaError = error as { code?: string; meta?: unknown };
    const targets = getP2002TargetFields(prismaError);
    const isEmailUniqueViolation =
      prismaError?.code === "P2002" &&
      targets.some((t) => t.toLowerCase().includes("email"));

    if (isEmailUniqueViolation) {
      res
        .status(409)
        .json({ error: "Email already registered", code: "CONFLICT" });
      return;
    }

    sendErrorResponse(res, error, req);
  }
};

export const handleLogin: RequestHandler = async (req, res) => {
  try {
    const body = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const passwordValid = await verifyPassword(
      body.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const token = createTokenOrFail(req, res, user);
    if (!token) return;
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleProfile: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleUpdateProfile: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const body = UpdateProfileSchema.parse(req.body);

    const currentUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const nextPasswordHash =
      body.password !== undefined
        ? await hashPassword(body.password)
        : undefined;

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(nextPasswordHash !== undefined
          ? { passwordHash: nextPasswordHash }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
      },
    });

    if (body.email !== undefined && body.email !== currentUser.email) {
      const token = createTokenOrFail(req, res, {
        id: user.id,
        email: user.email,
        role: user.role,
      });
      if (!token) return;
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    }

    res.json({ user });
  } catch (error) {
    const prismaError = error as { code?: string; meta?: unknown };
    const targets = getP2002TargetFields(prismaError);
    const isEmailUniqueViolation =
      prismaError?.code === "P2002" &&
      targets.some((t) => t.toLowerCase().includes("email"));

    if (isEmailUniqueViolation) {
      res
        .status(409)
        .json({ error: "Email already registered", code: "CONFLICT" });
      return;
    }
    sendErrorResponse(res, error, req);
  }
};

export const handleLogout: RequestHandler = (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieClearOptions());
  res.json({ success: true });
};

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Set password using token from welcome email (employee onboarding) */
export const handleSetPassword: RequestHandler = async (req, res) => {
  try {
    const body = SetPasswordSchema.parse(req.body);

    const record = await prisma.setPasswordToken.findUnique({
      where: { token: body.token },
      include: { user: true },
    });

    if (!record) {
      res.status(400).json({
        error:
          "Invalid or expired link. Please ask your manager to resend the invitation.",
      });
      return;
    }

    if (record.expiresAt < new Date()) {
      await prisma.setPasswordToken.delete({ where: { id: record.id } });
      res.status(400).json({
        error:
          "This link has expired. Please ask your manager to resend the invitation.",
      });
      return;
    }

    const passwordHash = await hashPassword(body.password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.setPasswordToken.delete({ where: { id: record.id } }),
    ]);

    const token = createTokenOrFail(req, res, record.user);
    if (!token) return;
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    res.json({
      success: true,
      user: {
        id: record.user.id,
        name: record.user.name,
        email: record.user.email,
        role: record.user.role,
        teamId: record.user.teamId,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

/** Request password reset - sends email with reset link */
export const handleForgotPassword: RequestHandler = async (req, res) => {
  const startTime = Date.now();
  const MIN_RESPONSE_TIME_MS = 500; // Minimum response time to prevent timing attacks

  try {
    const body = ForgotPasswordSchema.parse(req.body);

    // Always return success to prevent email enumeration
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    const expiryHours = getPasswordResetTokenExpiryHours();

    if (!user) {
      // Return success even if user doesn't exist to prevent email enumeration
      // Add delay to prevent timing attacks
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_RESPONSE_TIME_MS - elapsed),
        );
      }
      res.json({
        success: true,
        message:
          "If an account exists with this email, a password reset link has been sent.",
        expiryHours, // Expose expiry for frontend
      });
      return;
    }

    // Generate secure token
    const resetToken = generateSecureToken();
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // Delete any existing reset token for this user and create a new one
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    // Build reset link
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:8080";
    const resetLink = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`;

    // Send email asynchronously (don't await) to prevent timing attacks
    // This ensures both code paths (user exists / doesn't exist) take similar time
    sendPasswordResetEmail(user.email, user.name, resetLink, expiryHours).catch(
      (error) => {
        // Log email failures but don't fail the request
        logger.error("Failed to send password reset email", error);
      },
    );

    // Add delay to prevent timing attacks (uniform for both paths)
    const elapsed = Date.now() - startTime;
    if (elapsed < MIN_RESPONSE_TIME_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_RESPONSE_TIME_MS - elapsed),
      );
    }

    res.json({
      success: true,
      message:
        "If an account exists with this email, a password reset link has been sent.",
      expiryHours, // Expose expiry for frontend
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

/** Reset password using token from email */
export const handleResetPassword: RequestHandler = async (req, res) => {
  try {
    const body = ResetPasswordSchema.parse(req.body);

    // Hash the provided token to search for matching hash in DB
    const tokenHash = hashToken(body.token);

    // Find record by tokenHash (atomic lookup)
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      res.status(400).json({
        error:
          "Invalid or expired reset link. Please request a new password reset.",
      });
      return;
    }

    if (record.expiresAt < new Date()) {
      // Delete expired token (best effort, ignore if already deleted)
      await prisma.passwordResetToken.deleteMany({
        where: { id: record.id },
      });
      res.status(400).json({
        error:
          "This reset link has expired. Please request a new password reset.",
      });
      return;
    }

    const passwordHash = await hashPassword(body.password);

    // Atomic transaction: delete token FIRST, then update password
    // This ensures that if two requests arrive concurrently, only one can consume the token
    const result = await prisma.$transaction(async (tx) => {
      // Delete token atomically FIRST (only if it still exists)
      // This acts as a lock: if count === 0, another request already consumed it
      const deleteResult = await tx.passwordResetToken.deleteMany({
        where: { id: record.id },
      });

      // If token was already deleted (race condition), abort transaction
      if (deleteResult.count === 0) {
        return null;
      }

      // Token successfully consumed, now safe to update password
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      return record.user;
    });

    // Handle race condition: if token was already used, return error
    if (!result) {
      res.status(400).json({
        error:
          "This reset link has already been used. Please request a new password reset.",
      });
      return;
    }

    // Optionally log the user in after password reset
    const token = createTokenOrFail(req, res, result);
    if (!token) return;
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    res.json({
      success: true,
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
        role: result.role,
        teamId: result.teamId,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};
