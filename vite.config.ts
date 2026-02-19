import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Server as HttpServer } from "http";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  test: {
    environment: "jsdom",
  },
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: [".", "./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve",
    async configureServer(server) {
      // Dynamic import: avoid loading server/Prisma when Vitest loads this config
      const { createApp, attachSocketIO } = await import("./server");
      const app = createApp();

      // Attach Socket.IO to Vite's HTTP server for real-time in dev
      if (server.httpServer) {
        attachSocketIO(server.httpServer as HttpServer, app);
      }

      server.middlewares.use(app);
    },
  };
}
