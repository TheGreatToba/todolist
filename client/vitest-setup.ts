/**
 * Vitest setup for client tests (jsdom).
 *
 * - Extends expect with @testing-library/jest-dom matchers (toBeInTheDocument, toBeDisabled, etc.).
 * - Explicit afterEach(cleanup): Vitest does not run RTL's auto-cleanup by default in our config,
 *   so we call cleanup() to avoid duplicate nodes and cross-test DOM leakage.
 * - MSW lifecycle: listen once, resetHandlers after each test, close at end. Centralized so specs
 *   using MSW don't duplicate beforeAll/afterEach/afterAll.
 */
import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "@/test/mocks/server";

afterEach(() => {
  cleanup();
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
