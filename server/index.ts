import "dotenv/config";
import express, { Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { ensureAuthConfig, verifyToken, AUTH_COOKIE_NAME } from "./lib/auth";
import { requireAuth, requireRole } from "./middleware/requireAuth";
import { parse as parseCookie } from "cookie";
import { setCsrfCookieIfMissing, validateCsrf, ensureCsrfConfig } from "./lib/csrf";
import { requestIdMiddleware } from "./lib/observability";
import { logger } from "./lib/logger";

ensureAuthConfig();
ensureCsrfConfig();
import cors from "cors";
import { getCorsOptions, getSocketCorsOrigin } from "./lib/cors";
import { createServer as createHttpServer, Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import prisma from "./lib/db";
import { setIO } from "./lib/socket";
import { handleDemo } from "./routes/demo";
import { handleSignup, handleLogin, handleProfile, handleLogout, handleSetPassword } from "./routes/auth";
import {
  handleGetEmployeeDailyTasks,
  handleUpdateDailyTask,
  handleCreateTaskTemplate,
  handleGetManagerDashboard,
  handleDailyTaskAssignment,
} from "./routes/tasks";
import {
  handleGetWorkstations,
  handleCreateWorkstation,
  handleCreateEmployee,
  handleDeleteWorkstation,
  handleGetTeamMembers,
  handleUpdateEmployeeWorkstations,
} from "./routes/workstations";

export function createApp(): Express {
  const app = express();

  // Trust proxy for correct client IP behind reverse proxy (rate limit, etc.)
  if (process.env.TRUST_PROXY === "true") {
    app.set("trust proxy", 1);
  }

  // Observability: request ID for correlation (X-Request-ID in response)
  app.use(requestIdMiddleware);

  // Security headers (helmet) - X-Content-Type-Options, X-Frame-Options, etc.
  // TODO: Replace style-src 'unsafe-inline' with nonce/hash when build setup allows (Tailwind)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          frameAncestors: ["'self'"],
        },
      },
    })
  );

  // Middleware - CORS hardened per env (see server/lib/cors.ts)
  app.use(cors(getCorsOptions()));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Rate limit sensitive endpoints (generous in test)
  const isTest = process.env.NODE_ENV === "test";
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: isTest ? 1000 : 20,
    message: { error: "Too many attempts, please try again later" },
  });
  const setPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1h
    max: isTest ? 1000 : 10,
    message: { error: "Too many attempts, please try again later" },
  });
  const createEmployeeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 1000 : 30,
    message: { error: "Too many requests, please try again later" },
  });

  // CSRF: set cookie on GET so client can read it; validate on state-changing (exempts set-password)
  app.use(setCsrfCookieIfMissing);
  app.use(validateCsrf);

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Auth routes (rate-limited)
  app.post("/api/auth/signup", authLimiter, handleSignup);
  app.post("/api/auth/login", authLimiter, handleLogin);
  app.get("/api/auth/profile", requireAuth, handleProfile);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/set-password", setPasswordLimiter, handleSetPassword);

  // Task routes
  app.get("/api/tasks/daily", requireAuth, handleGetEmployeeDailyTasks);
  app.patch("/api/tasks/daily/:taskId", requireAuth, handleUpdateDailyTask);
  app.post("/api/tasks/templates", requireAuth, requireRole("MANAGER"), handleCreateTaskTemplate);
  app.get("/api/manager/dashboard", requireAuth, requireRole("MANAGER"), handleGetManagerDashboard);
  app.post("/api/cron/daily-tasks", handleDailyTaskAssignment);

  // Workstation routes
  app.get("/api/workstations", requireAuth, requireRole("MANAGER"), handleGetWorkstations);
  app.post("/api/workstations", requireAuth, requireRole("MANAGER"), handleCreateWorkstation);
  app.delete("/api/workstations/:workstationId", requireAuth, requireRole("MANAGER"), handleDeleteWorkstation);

  // Employee management routes (rate-limited)
  app.post("/api/employees", createEmployeeLimiter, requireAuth, requireRole("MANAGER"), handleCreateEmployee);
  app.get("/api/team/members", requireAuth, requireRole("MANAGER"), handleGetTeamMembers);
  app.patch("/api/employees/:employeeId/workstations", requireAuth, requireRole("MANAGER"), handleUpdateEmployeeWorkstations);

  return app;
}

function setupSocketIO(io: SocketIOServer, app: Express): void {
  io.on("connection", (socket) => {
    const { userId, teamIds } = socket.data as { userId: string; teamIds: string[] };
    socket.join(`user:${userId}`);
    for (const teamId of teamIds) {
      socket.join(`team:${teamId}`);
    }
    logger.debug("Client connected:", socket.id, "user:", userId);

    socket.on("disconnect", () => {
      logger.debug("Client disconnected:", socket.id);
    });
  });

  (app as Express & { io?: SocketIOServer }).io = io;
  setIO(io);
}

export function attachSocketIO(httpServer: HttpServer, app: Express): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: getSocketCorsOrigin(),
      methods: ["GET", "POST"],
    },
  });

  // Auth middleware: require valid JWT (from auth token or httpOnly cookie)
  io.use(async (socket, next) => {
    let token = socket.handshake.auth?.token as string | undefined;
    if (!token && socket.handshake.headers.cookie) {
      const parsed = parseCookie(socket.handshake.headers.cookie);
      token = parsed[AUTH_COOKIE_NAME];
    }
    if (!token) {
      return next(new Error("Authentication required"));
    }
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error("Invalid token"));
    }

    const teamIds: string[] = [];
    if (payload.role === "EMPLOYEE") {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { teamId: true },
      });
      if (user?.teamId) teamIds.push(user.teamId);
    } else if (payload.role === "MANAGER") {
      const teams = await prisma.team.findMany({
        where: { managerId: payload.userId },
        select: { id: true },
      });
      teamIds.push(...teams.map((t) => t.id));
    }

    (socket.data as { userId: string; teamIds: string[] }).userId = payload.userId;
    (socket.data as { userId: string; teamIds: string[] }).teamIds = teamIds;
    next();
  });

  setupSocketIO(io, app);
  return io;
}

export function createServer(): HttpServer {
  const app = createApp();
  const httpServer = createHttpServer(app);
  attachSocketIO(httpServer, app);
  return httpServer;
}
