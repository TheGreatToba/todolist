import "dotenv/config";
import express, { Express } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { ensureAuthConfig, verifyToken, extractToken, AUTH_COOKIE_NAME } from "./lib/auth";
import { parse as parseCookie } from "cookie";

ensureAuthConfig();
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

  // Security headers (helmet) - X-Content-Type-Options, X-Frame-Options, etc.
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

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Auth routes
  app.post("/api/auth/signup", handleSignup);
  app.post("/api/auth/login", handleLogin);
  app.get("/api/auth/profile", handleProfile);
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/auth/set-password", handleSetPassword);

  // Task routes
  app.get("/api/tasks/daily", handleGetEmployeeDailyTasks);
  app.patch("/api/tasks/daily/:taskId", handleUpdateDailyTask);
  app.post("/api/tasks/templates", handleCreateTaskTemplate);
  app.get("/api/manager/dashboard", handleGetManagerDashboard);
  app.post("/api/cron/daily-tasks", handleDailyTaskAssignment);

  // Workstation routes
  app.get("/api/workstations", handleGetWorkstations);
  app.post("/api/workstations", handleCreateWorkstation);
  app.delete("/api/workstations/:workstationId", handleDeleteWorkstation);

  // Employee management routes
  app.post("/api/employees", handleCreateEmployee);
  app.get("/api/team/members", handleGetTeamMembers);
  app.patch("/api/employees/:employeeId/workstations", handleUpdateEmployeeWorkstations);

  return app;
}

function setupSocketIO(io: SocketIOServer, app: Express): void {
  io.on("connection", (socket) => {
    const { userId, teamIds } = socket.data as { userId: string; teamIds: string[] };
    socket.join(`user:${userId}`);
    for (const teamId of teamIds) {
      socket.join(`team:${teamId}`);
    }
    console.log("Client connected:", socket.id, "user:", userId);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
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
