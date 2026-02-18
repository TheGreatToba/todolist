import path from "path";
import type { Request, Response } from "express";
import express from "express";
import { createServer } from "./index";
import { logger } from "./lib/logger";

const httpServer = createServer();
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../dist/spa");

// Get Express app from HTTP server (createServer returns app when used as handler)
const app = httpServer as unknown as express.Express;

// Serve static files
app.use(express.static(distPath));

// Handle React Router - serve index.html for all non-API routes
app.get("*", (req: Request, res: Response) => {
  // Don't serve index.html for API routes or WebSocket routes
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/socket.io")
  ) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

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
