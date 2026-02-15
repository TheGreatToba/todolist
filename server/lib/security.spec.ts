/**
 * Security regression tests: clearCookie options, SET_PASSWORD_TOKEN_EXPIRY_HOURS, CSP, CSRF logs.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { getAuthCookieOptions, getAuthCookieClearOptions } from "./auth";
import { ensureCsrfConfig } from "./csrf";
import { getSetPasswordTokenExpiryHours } from "./set-password-expiry";
import request from "supertest";
import { createApp } from "../index";

describe("getAuthCookieOptions / getAuthCookieClearOptions", () => {
  it("clearCookie options mirror setCookie options (path, httpOnly, secure, sameSite)", () => {
    const setOpts = getAuthCookieOptions();
    const clearOpts = getAuthCookieClearOptions();

    expect(clearOpts.path).toBe(setOpts.path);
    expect(clearOpts.httpOnly).toBe(setOpts.httpOnly);
    expect(clearOpts.secure).toBe(setOpts.secure);
    expect(clearOpts.sameSite).toBe(setOpts.sameSite);
    expect(clearOpts).not.toHaveProperty("maxAge");
  });
});

describe("getSetPasswordTokenExpiryHours", () => {
  const envBackup = process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS;

  afterEach(() => {
    delete process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS;
    if (envBackup !== undefined) process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS = envBackup;
  });

  it("returns 24 when env is empty", () => {
    delete process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS;
    expect(getSetPasswordTokenExpiryHours()).toBe(24);
  });

  it("returns 24 when env is NaN", () => {
    process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS = "invalid";
    expect(getSetPasswordTokenExpiryHours()).toBe(24);
  });

  it("returns 24 when env is 0", () => {
    process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS = "0";
    expect(getSetPasswordTokenExpiryHours()).toBe(24);
  });

  it("returns 24 when env is negative", () => {
    process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS = "-5";
    expect(getSetPasswordTokenExpiryHours()).toBe(24);
  });

  it("clamps to 168 when env exceeds max", () => {
    process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS = "200";
    expect(getSetPasswordTokenExpiryHours()).toBe(168);
  });

  it("returns valid value when env is valid", () => {
    process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS = "12";
    expect(getSetPasswordTokenExpiryHours()).toBe(12);
    process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS = "48";
    expect(getSetPasswordTokenExpiryHours()).toBe(48);
  });
});

describe("ensureCsrfConfig", () => {
  const envBackup = { nodeEnv: process.env.NODE_ENV, disableCsrf: process.env.DISABLE_CSRF };

  afterEach(() => {
    process.env.NODE_ENV = envBackup.nodeEnv;
    process.env.DISABLE_CSRF = envBackup.disableCsrf;
  });

  it("throws when DISABLE_CSRF=true in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DISABLE_CSRF = "true";
    expect(() => ensureCsrfConfig()).toThrow("DISABLE_CSRF=true is not allowed in production");
  });
});

describe("CSRF rejection logs", () => {
  const envBackup = { nodeEnv: process.env.NODE_ENV, disableCsrf: process.env.DISABLE_CSRF };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    delete process.env.DISABLE_CSRF;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = envBackup.nodeEnv;
    process.env.DISABLE_CSRF = envBackup.disableCsrf;
    warnSpy.mockRestore();
  });

  it("logs missing_cookie when csrf-token cookie is absent", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/auth/login")
      .set("X-CSRF-TOKEN", "some-token")
      .send({ email: "mgr@test.com", password: "password" });

    expect(res.status).toBe(403);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const raw = warnSpy.mock.calls[0][0];
    expect(typeof raw).toBe("string");
    const log = JSON.parse(raw as string);
    expect(log).toMatchObject({
      event: "csrf_rejected",
      method: "POST",
      path: "/api/auth/login",
      reason: "missing_cookie",
    });
    expect(log.requestId).toBeDefined();
    expect(typeof log.requestId).toBe("string");
  });

  it("logs missing_header when X-CSRF-TOKEN header is absent", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.get("/api/ping"); // receive csrf-token cookie

    const res = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    expect(res.status).toBe(403);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const raw = warnSpy.mock.calls[0][0];
    expect(typeof raw).toBe("string");
    const log = JSON.parse(raw as string);
    expect(log).toMatchObject({
      event: "csrf_rejected",
      method: "POST",
      path: "/api/auth/login",
      reason: "missing_header",
    });
    expect(log.requestId).toBeDefined();
    expect(typeof log.requestId).toBe("string");
  });

  it("logs mismatch when header does not match cookie", async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.get("/api/ping"); // receive csrf-token cookie

    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-TOKEN", "wrong-token")
      .send({ email: "mgr@test.com", password: "password" });

    expect(res.status).toBe(403);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const raw = warnSpy.mock.calls[0][0];
    expect(typeof raw).toBe("string");
    const log = JSON.parse(raw as string);
    expect(log).toMatchObject({
      event: "csrf_rejected",
      method: "POST",
      path: "/api/auth/login",
      reason: "mismatch",
    });
    expect(log.requestId).toBeDefined();
    expect(typeof log.requestId).toBe("string");
  });

  it("reprises X-Request-ID from request into CSRF rejection log", async () => {
    const app = createApp();
    const customId = "my-trace-id-12345";

    const res = await request(app)
      .post("/api/auth/login")
      .set("X-Request-ID", customId)
      .set("X-CSRF-TOKEN", "any-token")
      .send({ email: "mgr@test.com", password: "password" });

    expect(res.status).toBe(403);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const raw = warnSpy.mock.calls[0][0];
    expect(typeof raw).toBe("string");
    const log = JSON.parse(raw as string);
    expect(log.requestId).toBe(customId);
  });
});

describe("Request ID (observability)", () => {
  it("adds X-Request-ID to response", async () => {
    const app = createApp();
    const res = await request(app).get("/api/ping");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect(res.headers["x-request-id"]!.length).toBeGreaterThan(0);
  });

  it("reprises X-Request-ID from request into response", async () => {
    const app = createApp();
    const customId = "trace-abc-123";
    const res = await request(app)
      .get("/api/ping")
      .set("X-Request-ID", customId);
    expect(res.headers["x-request-id"]).toBe(customId);
  });
});

describe("CSP headers", () => {
  it("includes expected directives (defaultSrc, scriptSrc, styleSrc, connectSrc with ws/wss)", async () => {
    const app = createApp();
    const res = await request(app).get("/api/ping");

    const csp = res.headers["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src ");
    expect(csp).toMatch(/connect-src[^;]*'self'[^;]*ws:/);
    expect(csp).toMatch(/connect-src[^;]*wss:/);
    expect(csp).toContain("frame-ancestors 'self'");
  });
});
