import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { Server as HttpServer } from "http";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  test: {
    pool: "forks",
    environment: "jsdom",
    setupFiles: ["./client/vitest-setup.ts"],
    include: ["client/**/*.spec.{ts,tsx}", "server/**/*.spec.ts"],
    // Server tests run via test:server (VITEST_SERVER=1) so MSW is off; they execute in same env
    // but against real app. For explicit node env for server, use a separate Vitest config if needed.
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
    base: "/", // assets loaded from same origin (no absolute URL)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("react-router-dom")
          ) {
            return "react-vendor";
          }

          if (id.includes("@tanstack/react-query")) {
            return "query-vendor";
          }

          if (id.includes("@radix-ui") || id.includes("lucide-react")) {
            return "ui-vendor";
          }

          if (id.includes("recharts")) {
            return "charts-vendor";
          }

          return "vendor";
        },
      },
    },
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
