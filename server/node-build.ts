import path from "path";
import { createServer } from "./index";
import express from "express";

const httpServer = createServer();
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../dist/spa");

// Get Express app from HTTP server
const app = httpServer as any;

// Serve static files
app.use(express.static(distPath));

// Handle React Router - serve index.html for all non-API routes
app.get("*", (req: any, res: any) => {
  // Don't serve index.html for API routes or WebSocket routes
  if (req.path.startsWith("/api/") || req.path.startsWith("/health") || req.path.startsWith("/socket.io")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

httpServer.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
  console.log(`⚡ WebSocket: ws://localhost:${port}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
