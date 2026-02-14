import "dotenv/config";
import express, { Express } from "express";
import { ensureAuthConfig } from "./lib/auth";

ensureAuthConfig();
import cors from "cors";
import { createServer as createHttpServer, Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { handleDemo } from "./routes/demo";
import { handleSignup, handleLogin, handleProfile } from "./routes/auth";
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

  // Middleware
  app.use(cors());
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

  // Task routes
  app.get("/api/tasks/daily", handleGetEmployeeDailyTasks);
  app.patch("/api/tasks/daily/:taskId", handleUpdateDailyTask);
  app.post("/api/tasks/templates", handleCreateTaskTemplate);
  app.get("/api/manager/dashboard", handleGetManagerDashboard);
  app.post("/api/cron/daily-tasks", handleDailyTaskAssignment);
  app.get("/api/cron/daily-tasks", handleDailyTaskAssignment);

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
    console.log("Client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });

    socket.on("task:completed", (data) => {
      io.emit("task:updated", data);
    });
  });

  (app as any).io = io;
  (global as any).app = app;
}

export function attachSocketIO(httpServer: HttpServer, app: Express): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
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
