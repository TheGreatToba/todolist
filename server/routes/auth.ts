import { RequestHandler } from 'express';
import { z } from 'zod';
import prisma from '../lib/db';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  extractToken,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  getAuthCookieClearOptions,
} from '../lib/auth';

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

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const handleProfile: RequestHandler = async (req, res) => {
  try {
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
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

    const token = generateToken({
      userId: record.user.id,
      email: record.user.email,
      role: record.user.role,
    });

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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
