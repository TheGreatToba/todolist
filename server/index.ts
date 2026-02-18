import "dotenv/config";
import express, { Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { ensureAuthConfig, verifyToken, AUTH_COOKIE_NAME } from "./lib/auth";
import { requireAuth, requireRole } from "./middleware/requireAuth";
import { parse as parseCookie } from "cookie";
import {
  setCsrfCookieIfMissing,
  validateCsrf,
  ensureCsrfConfig,
} from "./lib/csrf";
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
import {
  handleSignup,
  handleLogin,
  handleProfile,
  handleLogout,
  handleSetPassword,
} from "./routes/auth";
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
  // TRUST_PROXY can be:
  // - "false" or unset: do not trust any proxy (default)
  // - "true": trust exactly 1 proxy (Client -> Proxy -> Express)
  // - "<number>": trust the first N proxies (e.g. "2" for CDN + LB)
  // See: https://expressjs.com/en/guide/behind-proxies.html
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv && trustProxyEnv !== "false") {
    let trustProxyValue: number;
    if (trustProxyEnv === "true") {
      trustProxyValue = 1;
    } else {
      const parsed = Number(trustProxyEnv);
      if (!Number.isNaN(parsed) && Number.isInteger(parsed) && parsed > 0) {
        trustProxyValue = parsed;
      } else {
        logger.warn(
          `Invalid TRUST_PROXY value "${trustProxyEnv}". Expected "true", "false" or positive integer. Falling back to 1.`,
        );
        trustProxyValue = 1;
      }
    }
    app.set("trust proxy", trustProxyValue);
  } else if (process.env.NODE_ENV === "production") {
    // Warn in production if TRUST_PROXY is not enabled when behind a proxy
    logger.warn(
      "TRUST_PROXY is disabled in production. Rate limits may use incorrect IPs if the app runs behind a reverse proxy.",
    );
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
    }),
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

  const isCronSecretConfigured = (): boolean => {
    const expectedSecret = process.env.CRON_SECRET;
    return !!expectedSecret && expectedSecret.trim() !== "";
  };

  const isValidCronSecret = (req: express.Request): boolean => {
    if (!isCronSecretConfigured()) return false;
    const secret = req.headers["x-cron-secret"];
    return !!secret && secret === process.env.CRON_SECRET;
  };

  // Cron rate limiter: only applies to requests with valid secret to prevent DoS
  // Invalid secret requests are rejected immediately without consuming quota
  const cronLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 min
    max: isTest ? 1000 : 2, // Allow 2 requests/min to handle retries (idempotent endpoint)
    message: { error: "Too many cron requests, please try again later" },
    // Only apply rate limit to requests with valid secret
    skip: (req) => {
      if (!isCronSecretConfigured()) return true; // Skip if endpoint disabled
      return !isValidCronSecret(req as express.Request);
    },
  });

  // Middleware to verify cron secret before rate limit (rejects invalid secrets immediately)
  const verifyCronSecret: express.RequestHandler = (req, res, next) => {
    if (!isCronSecretConfigured()) {
      res.status(503).json({
        error:
          "Cron endpoint is disabled. Set CRON_SECRET in your environment to enable it.",
      });
      return;
    }

    if (!isValidCronSecret(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next(); // Secret valid, proceed to rate limit and handler
  };

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
  app.post(
    "/api/tasks/templates",
    requireAuth,
    requireRole("MANAGER"),
    handleCreateTaskTemplate,
  );
  app.get(
    "/api/manager/dashboard",
    requireAuth,
    requireRole("MANAGER"),
    handleGetManagerDashboard,
  );
  // Cron endpoint: verify secret first (rejects invalid secrets without consuming rate limit quota)
  // then apply rate limit only to authenticated requests
  app.post(
    "/api/cron/daily-tasks",
    verifyCronSecret,
    cronLimiter,
    handleDailyTaskAssignment,
  );

  // Workstation routes
  app.get(
    "/api/workstations",
    requireAuth,
    requireRole("MANAGER"),
    handleGetWorkstations,
  );
  app.post(
    "/api/workstations",
    requireAuth,
    requireRole("MANAGER"),
    handleCreateWorkstation,
  );
  app.delete(
    "/api/workstations/:workstationId",
    requireAuth,
    requireRole("MANAGER"),
    handleDeleteWorkstation,
  );

  // Employee management routes (rate-limited)
  app.post(
    "/api/employees",
    createEmployeeLimiter,
    requireAuth,
    requireRole("MANAGER"),
    handleCreateEmployee,
  );
  app.get(
    "/api/team/members",
    requireAuth,
    requireRole("MANAGER"),
    handleGetTeamMembers,
  );
  app.patch(
    "/api/employees/:employeeId/workstations",
    requireAuth,
    requireRole("MANAGER"),
    handleUpdateEmployeeWorkstations,
  );

  return app;
}

function setupSocketIO(io: SocketIOServer, app: Express): void {
  io.on("connection", (socket) => {
    const { userId, teamIds } = socket.data as {
      userId: string;
      teamIds: string[];
    };
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

export function attachSocketIO(
  httpServer: HttpServer,
  app: Express,
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: getSocketCorsOrigin(),
      methods: ["GET", "POST"],
    },
  });

  // Auth middleware: require valid JWT (from auth token or httpOnly cookie)
  io.use(async (socket, next) => {
    try {
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

      (socket.data as { userId: string; teamIds: string[] }).userId =
        payload.userId;
      (socket.data as { userId: string; teamIds: string[] }).teamIds = teamIds;
      return next();
    } catch (error) {
      // Log full error details for debugging, but return generic error to client
      logger.error("Socket.io auth middleware error", error);
      return next(new Error("Authentication failed"));
    }
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
