/**
 * Security regression tests: clearCookie options, SET_PASSWORD_TOKEN_EXPIRY_HOURS, CSP.
 */
import { describe, it, expect, afterEach } from "vitest";
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
