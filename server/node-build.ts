import { createServer as createHttpServer } from "http";
import path from "path";
import type { Request, Response } from "express";
import express from "express";
import { createApp, attachSocketIO } from "./index";
import { logger } from "./lib/logger";

const port = process.env.PORT || 3000;

// Build Express app and add production-only SPA static + fallback
const app = createApp();

const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../dist/spa");

app.use(express.static(distPath));

// Express 5: catch-all must use a named param (path-to-regexp v8)
app.get("/{*splat}", (req: Request, res: Response) => {
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/socket.io")
  ) {
    return res.status(404).json({ error: "API endpoint not found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});

const httpServer = createHttpServer(app);
attachSocketIO(httpServer, app);

httpServer.listen(port, () => {
  logger.info(`🚀 Fusion Starter server running on port ${port}`);
  logger.info(`📱 Frontend: http://localhost:${port}`);
  logger.info(`🔧 API: http://localhost:${port}/api`);
  logger.info(`⚡ WebSocket: ws://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
