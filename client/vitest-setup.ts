/**
 * Vitest setup for client tests (jsdom).
 *
 * - Extends expect with @testing-library/jest-dom matchers.
 * - afterEach(cleanup) for RTL.
 * - MSW: only started when NOT running server-only (VITEST_SERVER=1). Server specs are run via
 *   "pnpm test:server" with VITEST_SERVER=1 so they don't load MSW and get real HTTP to the app.
 */
import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// Only start MSW when running client tests. Server tests use VITEST_SERVER=1 and skip MSW.
import { server } from "@/test/mocks/server";
if (process.env.VITEST_SERVER !== "1") {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: "warn" });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
}
