/**
 * Smoke test: start the production server (node-build), hit GET /api/ping,
 * then exit. Used in CI to catch regressions (e.g. wrong type cast breaking app.use).
 * Requires: pnpm build already run (dist/ exists).
 * Env: PORT (default 34567), DATABASE_URL, JWT_SECRET (for server boot).
 */
import { spawn } from "node:child_process";

const PORT = process.env.SMOKE_PORT || process.env.PORT || "34567";
const BASE = `http://127.0.0.1:${PORT}`;
const PING_URL = `${BASE}/api/ping`;
const MAX_WAIT_MS = 15000;
const POLL_MS = 300;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer() {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(PING_URL);
      if (res.ok) return res;
    } catch {
      // not ready yet
    }
    await sleep(POLL_MS);
  }
  return null;
}

function waitForExit(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Process did not exit within ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

async function main() {
  const child = spawn(process.execPath, ["dist/server/node-build.mjs"], {
    env: { ...process.env, PORT },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const res = await waitForServer();
  if (!res) {
    child.kill("SIGTERM");
    console.error(
      "Smoke test failed: server did not respond to GET /api/ping within",
      MAX_WAIT_MS,
      "ms",
    );
    if (stderr) console.error("Server stderr:", stderr);
    process.exit(1);
  }

  const data = await res.json();
  if (typeof data?.message !== "string") {
    child.kill("SIGTERM");
    console.error(
      "Smoke test failed: /api/ping JSON invalid (expected { message: string })",
      data,
    );
    process.exit(1);
  }

  child.kill("SIGTERM");
  await waitForExit(child);

  console.log(
    "Smoke test OK: prod server started, GET /api/ping returned 200 and valid JSON",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
