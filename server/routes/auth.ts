import { RequestHandler } from 'express';
import { z } from 'zod';
import prisma from '../lib/db';
import { Request, Response } from 'express';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  isRole,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  getAuthCookieClearOptions,
} from '../lib/auth';
import { sendErrorResponse } from '../lib/errors';
import { getAuthOrThrow } from '../middleware/requireAuth';

/** Structured log when role from DB is invalid (do not emit JWT). */
function logInvalidRole(
  user: { id: string; email: string; role: unknown },
  req: Request
): void {
  console.warn(
    JSON.stringify({
      event: 'invalid_role_rejected',
      userId: user.id,
      email: user.email,
      role: user.role,
      endpoint: req.path,
      method: req.method,
      requestId: req.requestId,
    })
  );
}

/** Returns JWT payload for cookie, or null after logging and sending 500. */
function createTokenOrFail(
  req: Request,
  res: Response,
  user: { id: string; email: string; role: unknown }
): string | null {
  if (!isRole(user.role)) {
    logInvalidRole(user, req);
    res.status(500).json({ error: 'Invalid user role' });
    return null;
  }
  return generateToken({ userId: user.id, email: user.email, role: user.role });
}

const SetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

const SignupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['MANAGER']), // Only managers can signup directly
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const handleSignup: RequestHandler = async (req, res) => {
  try {
    const body = SignupSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(body.password);

    // Create user
    const user = await prisma.user.create({
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

    // If manager, create a default team
    if (body.role === 'MANAGER') {
      const team = await prisma.team.create({
        data: {
          name: `${body.name}'s Team`,
          managerId: user.id,
        },
      });

      // Update user with team ID
      await prisma.user.update({
        where: { id: user.id },
        data: { teamId: team.id },
      });
    }

    const token = createTokenOrFail(req, res, user);
    if (!token) return;
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
    res.status(201).json({ user });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

export const handleLogin: RequestHandler = async (req, res) => {
  try {
    const body = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordValid = await verifyPassword(body.password, user.passwordHash);

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
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
    sendErrorResponse(res, error);
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
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

export const handleLogout: RequestHandler = (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieClearOptions());
  res.json({ success: true });
};

/** Set password using token from welcome email (employee onboarding) */
export const handleSetPassword: RequestHandler = async (req, res) => {
  try {
    const body = SetPasswordSchema.parse(req.body);

    const record = await prisma.setPasswordToken.findUnique({
      where: { token: body.token },
      include: { user: true },
    });

    if (!record) {
      res.status(400).json({ error: 'Invalid or expired link. Please ask your manager to resend the invitation.' });
      return;
    }

    if (record.expiresAt < new Date()) {
      await prisma.setPasswordToken.delete({ where: { id: record.id } });
      res.status(400).json({ error: 'This link has expired. Please ask your manager to resend the invitation.' });
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
    sendErrorResponse(res, error);
  }
};
