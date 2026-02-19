/**
 * API integration tests for auth, permissions, and daily tasks.
 * Prerequisites: JWT_SECRET and DATABASE_URL in env (e.g. .env or CI). Run `pnpm seed` before tests.
 * Uses mgr@test.com (MANAGER) and emp@test.com (EMPLOYEE) with password "password".
 * Note: Auth uses httpOnly cookies; tests use supertest agent for cookie persistence.
 *
 * Note on MSW warnings: These backend tests make real HTTP calls to the Express server
 * (e.g., /api/auth/...) and may trigger MSW warnings. This is expected - MSW is configured
 * for client tests only. Backend tests intentionally bypass MSW to test the actual Express
 * server behavior. Email sending (sendPasswordResetEmail) is mocked to eliminate external
 * timing variations.
 */
import "dotenv/config";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { z } from "zod";

// Mock email module before importing app to ensure mocks work with static imports
vi.mock("./lib/email", async () => {
  const actual =
    await vi.importActual<typeof import("./lib/email")>("./lib/email");
  return {
    ...actual,
    sendPasswordResetEmail: vi.fn().mockResolvedValue({
      success: true,
      messageId: "test-message-id",
    }),
  };
});

import { createApp } from "./index";
import prisma from "./lib/db";
import { validateCsrf } from "./lib/csrf";
import {
  redactEmailForLog,
  emailHashForLog,
  EMAIL_HASH_FORMAT_REGEX,
} from "./lib/log-pii";
import {
  TASK_TEMPLATE_SAME_TEAM_MESSAGE,
  TASK_TEMPLATE_BULK_UPDATE_FORBIDDEN_MESSAGE,
} from "./lib/task-template-invariant";
import type { Request, Response, NextFunction } from "express";

const app = createApp();

/** Extract auth cookie value from login response for manual forwarding (supertest agent may not persist it). */
function getAuthCookieFromResponse(loginRes: request.Response): string | null {
  const setCookie = loginRes.headers["set-cookie"];
  if (!setCookie || !Array.isArray(setCookie) || setCookie.length === 0)
    return null;
  const cookieName =
    process.env.NODE_ENV === "production" ? "__Host-token" : "token";
  const line = setCookie.find((c: string) => c.startsWith(cookieName + "="));
  if (!line) return null;
  return line.split(";")[0].trim();
}

/** Chain .set("Cookie", cookie) onto agent requests when cookie is present (for tests that do multiple requests after login). */
function withAuthCookie(
  agent: ReturnType<typeof request.agent>,
  cookie: string | null,
) {
  if (!cookie) return agent;
  return {
    get: (url: string) => agent.get(url).set("Cookie", cookie),
    post: (url: string) => agent.post(url).set("Cookie", cookie),
    patch: (url: string) => agent.patch(url).set("Cookie", cookie),
    delete: (url: string) => agent.delete(url).set("Cookie", cookie),
  };
}

/**
 * Helper to assert that a login was successful and verify authentication state.
 * Returns the auth cookie (if present) so callers can pass it to subsequent requests
 * via .set("Cookie", cookie), since the supertest agent may not persist cookies.
 */
async function assertLoggedIn(
  agent: ReturnType<typeof request.agent>,
  expectedEmail: string,
  loginRes: request.Response,
): Promise<string | null> {
  expect(loginRes.status).toBe(200);
  expect(loginRes.body).toHaveProperty("user");
  expect(loginRes.body.user.email).toBe(expectedEmail);

  const cookieValue = getAuthCookieFromResponse(loginRes);
  const profileRes = cookieValue
    ? await agent.get("/api/auth/profile").set("Cookie", cookieValue)
    : await agent.get("/api/auth/profile");

  if (process.env.DEBUG_AUTH_TESTS && profileRes.status !== 200) {
    console.error(
      `[Diagnostic] Profile check failed for ${expectedEmail}:`,
      profileRes.status,
      profileRes.body,
    );
  }
  expect(profileRes.status).toBe(200);
  expect(profileRes.body.user.email).toBe(expectedEmail);
  return cookieValue;
}

describe("Auth API", () => {
  it("POST /api/auth/signup with MANAGER returns 201 and user", async () => {
    const email = `mgr-${Date.now()}@test.com`;
    const res = await request(app).post("/api/auth/signup").send({
      name: "Test Manager",
      email,
      password: "password123",
      role: "MANAGER",
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.role).toBe("MANAGER");
    expect(res.body.user.email).toBe(email);
  });

  it("POST /api/auth/signup with duplicate MANAGER email returns 409 CONFLICT", async () => {
    const email = `dup-mgr-${Date.now()}@test.com`;

    const first = await request(app).post("/api/auth/signup").send({
      name: "Dup Manager 1",
      email,
      password: "password123",
      role: "MANAGER",
    });
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/auth/signup").send({
      name: "Dup Manager 2",
      email,
      password: "password123",
      role: "MANAGER",
    });

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      error: "Email already registered",
      code: "CONFLICT",
    });
  });

  it("POST /api/auth/signup with EMPLOYEE returns 400 (only MANAGER allowed)", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Test Employee",
        email: `emp-${Date.now()}@test.com`,
        password: "password123",
        role: "EMPLOYEE",
      });

    expect(res.status).toBe(400);
  });

  it("POST /api/auth/login with valid credentials returns 200 and user", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe("mgr@test.com");
    expect(res.body.user.role).toBe("MANAGER");

    // Verify set-cookie header is present (when using request() directly, not agent)
    const cookies = res.headers["set-cookie"];
    if (cookies && Array.isArray(cookies)) {
      const cookieName =
        process.env.NODE_ENV === "production" ? "__Host-token" : "token";
      const hasAuthCookie = cookies.some((c: string) => {
        const cookieMatch = new RegExp(
          `^${cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=`,
        );
        return cookieMatch.test(c);
      });
      expect(hasAuthCookie).toBe(true);
    }
    // Note: When using request.agent(), cookies are handled internally and may not appear in headers
  });

  it("POST /api/auth/login sets cookie and agent persists session", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    await assertLoggedIn(agent, "mgr@test.com", loginRes);
  });

  it("POST /api/auth/login with invalid password returns 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("GET /api/auth/profile without token returns 401", async () => {
    const res = await request(app).get("/api/auth/profile");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/profile with valid cookie returns 200 and user", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent.get("/api/auth/profile");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.email).toBe("mgr@test.com");
  });

  // Minimal isolated test to diagnose auth persistence issues
  // This test has no DB setup, no other dependencies - just login -> profile
  // Enable DEBUG_AUTH_TESTS=1 to see detailed diagnostic output
  it("POST /api/auth/login -> GET /api/auth/profile minimal isolated test", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    await assertLoggedIn(agent, "mgr@test.com", loginRes);
  });

  describe("Password Reset", () => {
    // Cleanup helper: remove any existing password reset tokens for a user
    const cleanupPasswordResetTokens = async (email: string) => {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (user) {
        await prisma.passwordResetToken.deleteMany({
          where: { userId: user.id },
        });
      }
    };

    it("POST /api/auth/forgot-password with valid email returns 200 and sends reset email", async () => {
      // Cleanup any existing tokens
      await cleanupPasswordResetTokens("mgr@test.com");

      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "mgr@test.com" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message:
          "If an account exists with this email, a password reset link has been sent.",
      });
      expect(res.body.expiryHours).toBeGreaterThan(0);

      // Verify token was created in DB
      const user = await prisma.user.findUnique({
        where: { email: "mgr@test.com" },
        include: { passwordResetToken: true },
      });
      expect(user?.passwordResetToken).toBeTruthy();
      expect(user?.passwordResetToken?.tokenHash).toBeTruthy();

      // Cleanup after test
      await cleanupPasswordResetTokens("mgr@test.com");
    });

    it("POST /api/auth/forgot-password with non-existent email returns same message (email enumeration protection)", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent@test.com" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        message:
          "If an account exists with this email, a password reset link has been sent.",
      });
      expect(res.body.expiryHours).toBeGreaterThan(0);
    });

    it("POST /api/auth/reset-password with valid token resets password and logs user in", async () => {
      // Cleanup any existing tokens
      await cleanupPasswordResetTokens("mgr@test.com");

      // Create a reset token
      const user = await prisma.user.findUnique({
        where: { email: "mgr@test.com" },
      });
      expect(user).toBeTruthy();

      const crypto = await import("crypto");
      const resetToken = crypto.randomBytes(32).toString("hex");
      const { hashToken } = await import("./lib/auth");
      const tokenHash = hashToken(resetToken);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await prisma.passwordResetToken.create({
        data: {
          userId: user!.id,
          tokenHash,
          expiresAt,
        },
      });

      // Reset password
      const res = await request(app).post("/api/auth/reset-password").send({
        token: resetToken,
        password: "newpassword123",
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
      });
      expect(res.body.user.email).toBe("mgr@test.com");

      // Verify token was deleted
      const tokenRecord = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      expect(tokenRecord).toBeNull();

      // Verify password was changed
      const updatedUser = await prisma.user.findUnique({
        where: { email: "mgr@test.com" },
      });
      const { verifyPassword } = await import("./lib/auth");
      const passwordValid = await verifyPassword(
        "newpassword123",
        updatedUser!.passwordHash,
      );
      expect(passwordValid).toBe(true);

      // Reset password back for other tests
      const passwordHash = await (
        await import("./lib/auth")
      ).hashPassword("password");
      await prisma.user.update({
        where: { id: user!.id },
        data: { passwordHash },
      });
    });

    it("POST /api/auth/reset-password with invalid token returns 400", async () => {
      const res = await request(app).post("/api/auth/reset-password").send({
        token: "invalid-token",
        password: "newpassword123",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid or expired");
    });

    it("POST /api/auth/reset-password with expired token returns 400", async () => {
      // Cleanup any existing tokens
      await cleanupPasswordResetTokens("mgr@test.com");

      const user = await prisma.user.findUnique({
        where: { email: "mgr@test.com" },
      });
      expect(user).toBeTruthy();

      const crypto = await import("crypto");
      const resetToken = crypto.randomBytes(32).toString("hex");
      const { hashToken } = await import("./lib/auth");
      const tokenHash = hashToken(resetToken);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() - 1); // Expired

      await prisma.passwordResetToken.create({
        data: {
          userId: user!.id,
          tokenHash,
          expiresAt,
        },
      });

      const res = await request(app).post("/api/auth/reset-password").send({
        token: resetToken,
        password: "newpassword123",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("expired");

      // Verify token was deleted
      const tokenRecord = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      expect(tokenRecord).toBeNull();
    });

    it("POST /api/auth/reset-password handles race condition gracefully", async () => {
      // Use a dedicated user to avoid unique constraint (userId) and cross-test pollution
      const bcryptjs = (await import("bcryptjs")).default;
      const raceEmail = `race-${Date.now()}@test.com`;
      const raceUser = await prisma.user.create({
        data: {
          name: "Race Test User",
          email: raceEmail,
          passwordHash: await bcryptjs.hash("oldpass", 10),
          role: "MANAGER",
        },
      });
      const raceTeam = await prisma.team.create({
        data: { name: "Race Team", managerId: raceUser.id },
      });
      await prisma.user.update({
        where: { id: raceUser.id },
        data: { teamId: raceTeam.id },
      });

      const crypto = await import("crypto");
      const resetToken = crypto.randomBytes(32).toString("hex");
      const { hashToken } = await import("./lib/auth");
      const tokenHash = hashToken(resetToken);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      await prisma.passwordResetToken.create({
        data: {
          userId: raceUser.id,
          tokenHash,
          expiresAt,
        },
      });

      let successfulRes: request.Response | undefined;
      let failedRes: request.Response | undefined;
      try {
        // Simulate race condition: two concurrent requests with same token
        const [res1, res2] = await Promise.all([
          request(app).post("/api/auth/reset-password").send({
            token: resetToken,
            password: "newpassword123",
          }),
          (async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return request(app).post("/api/auth/reset-password").send({
              token: resetToken,
              password: "newpassword456",
            });
          })(),
        ]);

        successfulRes = [res1, res2].find((r) => r.status === 200);
        failedRes = [res1, res2].find(
          (r) =>
            r.status === 400 && r.body.error?.includes("already been used"),
        );

        expect(successfulRes).toBeDefined();
        expect(failedRes).toBeDefined();

        // Verify token was consumed (deleted)
        const tokenRecord = await prisma.passwordResetToken.findUnique({
          where: { tokenHash },
        });
        expect(tokenRecord).toBeNull();

        // One password must have been applied; verify it's one of the two
        const updatedUser = await prisma.user.findUnique({
          where: { id: raceUser.id },
        });
        expect(updatedUser).toBeTruthy();
        const { verifyPassword } = await import("./lib/auth");
        const matches123 = await verifyPassword(
          "newpassword123",
          updatedUser!.passwordHash,
        );
        const matches456 = await verifyPassword(
          "newpassword456",
          updatedUser!.passwordHash,
        );
        expect(matches123 !== matches456).toBe(true); // exactly one must match
      } finally {
        await prisma.passwordResetToken
          .deleteMany({ where: { userId: raceUser.id } })
          .catch(() => {});
        await prisma.user
          .delete({ where: { id: raceUser.id } })
          .catch(() => {});
        await prisma.team
          .delete({ where: { id: raceTeam.id } })
          .catch(() => {});
      }
    });

    it("POST /api/auth/forgot-password has uniform timing to prevent enumeration", async () => {
      // Cleanup any existing tokens
      await cleanupPasswordResetTokens("mgr@test.com");

      // Email sender is mocked at module level to eliminate external timing variations
      // (Ethereal account creation, network calls, etc.)
      const emailModule = await import("./lib/email");
      const sendEmailSpy = vi.mocked(emailModule.sendPasswordResetEmail);

      // Reset call count before test
      sendEmailSpy.mockClear();

      const MIN_RESPONSE_TIME_MS = 500;
      const TIMING_TOLERANCE_MS = 50; // Reduced tolerance since email is mocked
      // Allow up to 200ms difference between paths to account for:
      // - Middleware variations (CSRF, rate limiting, logging, etc.)
      // - Sequential request execution (second request may benefit from warmup)
      // - Test environment performance variations (CI vs local)
      // This is still much smaller than the minimum response time (500ms), so it effectively
      // prevents timing-based enumeration attacks while remaining stable in test environments.
      const MAX_TIMING_DIFF_MS = 200;

      // Test with existing email
      const startExisting = Date.now();
      const resExisting = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "mgr@test.com" });
      const durationExisting = Date.now() - startExisting;

      expect(resExisting.status).toBe(200);

      // Test with non-existent email
      const startNonExisting = Date.now();
      const resNonExisting = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "nonexistent@test.com" });
      const durationNonExisting = Date.now() - startNonExisting;

      expect(resNonExisting.status).toBe(200);

      // Both should take at least MIN_RESPONSE_TIME_MS (minus tolerance for test environment)
      expect(durationExisting).toBeGreaterThanOrEqual(
        MIN_RESPONSE_TIME_MS - TIMING_TOLERANCE_MS,
      );
      expect(durationNonExisting).toBeGreaterThanOrEqual(
        MIN_RESPONSE_TIME_MS - TIMING_TOLERANCE_MS,
      );

      // Timing difference should be small relative to minimum response time to prevent enumeration attacks
      // The 200ms threshold accounts for middleware and test environment variations while still
      // being much smaller than the 500ms minimum delay, effectively preventing timing attacks.
      const timingDiff = Math.abs(durationExisting - durationNonExisting);
      expect(
        timingDiff,
        `Timing difference (${timingDiff}ms) exceeds threshold (${MAX_TIMING_DIFF_MS}ms). ` +
          `Existing email: ${durationExisting}ms, Non-existent email: ${durationNonExisting}ms. ` +
          `This may indicate timing attack vulnerability or test environment instability.`,
      ).toBeLessThan(MAX_TIMING_DIFF_MS);

      // Verify email was only sent for existing email (not for non-existent)
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy).toHaveBeenCalledWith(
        "mgr@test.com",
        expect.any(String),
        expect.stringContaining("/reset-password"),
        expect.any(Number),
      );

      // Cleanup
      await cleanupPasswordResetTokens("mgr@test.com");
    });
  });

  it("POST /api/auth/login with invalid role in DB returns 500 and logs structured event (no JWT)", async () => {
    const email = `invalid-role-${Date.now()}@test.com`;
    const signupRes = await request(app).post("/api/auth/signup").send({
      name: "Invalid Role User",
      email,
      password: "password123",
      role: "MANAGER",
    });
    expect(signupRes.status).toBe(201);
    const userId = signupRes.body.user.id as string;

    // BYPASS_PATTERN: raw SQL only to set invalid role for this test; see legacy template test.
    await prisma.$executeRawUnsafe(
      "UPDATE User SET role = ? WHERE id = ?",
      "INVALID",
      userId,
    );

    const warnCalls: unknown[] = [];
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation((arg: unknown) => {
        warnCalls.push(arg);
      });
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    warnSpy.mockRestore();

    expect(loginRes.status).toBe(500);
    expect(loginRes.body).toMatchObject({ error: "Invalid user role" });
    const invalidRoleLog = warnCalls.find((arg) => {
      if (typeof arg !== "string") return false;
      try {
        const log = JSON.parse(arg);
        return log.event === "invalid_role_rejected";
      } catch {
        return false;
      }
    });
    expect(invalidRoleLog).toBeDefined();
    const log = JSON.parse(invalidRoleLog as string);
    expect(log).toMatchObject({
      event: "invalid_role_rejected",
      userId,
      email,
      role: "INVALID",
    });
    expect(log.endpoint).toBe("/api/auth/login");
  });

  it("production redacts email to ***@domain and adds stable emailHash (canonicalized)", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLogHashSecret = process.env.LOG_HASH_SECRET;
    process.env.NODE_ENV = "production";
    process.env.LOG_HASH_SECRET = "test-log-hash-secret";
    try {
      expect(redactEmailForLog("user@test.com")).toBe("***@test.com");
      expect(redactEmailForLog("a@example.org")).toBe("***@example.org");
      expect(redactEmailForLog("no-at")).toBe("***");

      const hash = emailHashForLog("user@test.com");
      expect(hash).toBeDefined();
      expect(hash).toMatch(EMAIL_HASH_FORMAT_REGEX);
      expect(hash).toMatch(/^v1_[a-f0-9]{24}$/); // external contract: format stable for log consumers / SIEM
      expect(emailHashForLog("user@test.com")).toBe(hash);
      expect(emailHashForLog("  User@Test.com  ")).toBe(hash);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalLogHashSecret === undefined)
        delete process.env.LOG_HASH_SECRET;
      else process.env.LOG_HASH_SECRET = originalLogHashSecret;
    }
  });

  it("emailHashForLog returns undefined when LOG_HASH_SECRET is not set (production)", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLogHashSecret = process.env.LOG_HASH_SECRET;
    process.env.NODE_ENV = "production";
    delete process.env.LOG_HASH_SECRET;
    try {
      expect(emailHashForLog("user@test.com")).toBeUndefined();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalLogHashSecret === undefined)
        delete process.env.LOG_HASH_SECRET;
      else process.env.LOG_HASH_SECRET = originalLogHashSecret;
    }
  });

  it("emailHashForLog returns undefined when LOG_HASH_SECRET is empty string (production)", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLogHashSecret = process.env.LOG_HASH_SECRET;
    process.env.NODE_ENV = "production";
    process.env.LOG_HASH_SECRET = "";
    try {
      expect(emailHashForLog("user@test.com")).toBeUndefined();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalLogHashSecret === undefined)
        delete process.env.LOG_HASH_SECRET;
      else process.env.LOG_HASH_SECRET = originalLogHashSecret;
    }
  });

  it("emailHashForLog returns undefined when LOG_HASH_SECRET is only whitespace (production)", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLogHashSecret = process.env.LOG_HASH_SECRET;
    process.env.NODE_ENV = "production";
    process.env.LOG_HASH_SECRET = "   ";
    try {
      expect(emailHashForLog("user@test.com")).toBeUndefined();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalLogHashSecret === undefined)
        delete process.env.LOG_HASH_SECRET;
      else process.env.LOG_HASH_SECRET = originalLogHashSecret;
    }
  });

  it("emailHashForLog normalizes LOG_HASH_SECRET (trim): same hash with or without surrounding spaces", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalLogHashSecret = process.env.LOG_HASH_SECRET;
    process.env.NODE_ENV = "production";
    try {
      process.env.LOG_HASH_SECRET = "secret";
      const hashNoSpaces = emailHashForLog("u@x.com");
      process.env.LOG_HASH_SECRET = "  secret  ";
      const hashWithSpaces = emailHashForLog("u@x.com");
      expect(hashNoSpaces).toBe(hashWithSpaces);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalLogHashSecret === undefined)
        delete process.env.LOG_HASH_SECRET;
      else process.env.LOG_HASH_SECRET = originalLogHashSecret;
    }
  });
});

describe("Permissions - role-based access", () => {
  it("GET /api/manager/dashboard as EMPLOYEE returns 403", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/manager/dashboard");

    expect(res.status).toBe(403);
  });

  it("GET /api/manager/dashboard as MANAGER returns 200", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent.get("/api/manager/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dailyTasks");
  });

  it("GET /api/manager/dashboard?date=invalid returns 400 with message", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent.get("/api/manager/dashboard?date=invalid");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("GET /api/manager/dashboard with date[foo]=bar returns 400 (malformed date query)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent
      .get("/api/manager/dashboard")
      .query({ "date[foo]": "bar" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("GET /api/manager/dashboard with date and date[foo] together returns 400 (strict policy)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent
      .get("/api/manager/dashboard")
      .query({ date: "2025-02-15", "date[foo]": "bar" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("GET /api/manager/dashboard with repeated employeeId returns 400", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent
      .get("/api/manager/dashboard")
      .query({ employeeId: ["emp-1", "emp-2"] });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining(
        "Repeated query parameters are not allowed",
      ),
    });
  });

  it("GET /api/manager/dashboard with repeated workstationId returns 400", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent
      .get("/api/manager/dashboard")
      .query({ workstationId: ["ws-1", "ws-2"] });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining(
        "Repeated query parameters are not allowed",
      ),
    });
  });

  it("GET /api/manager/dashboard as multi-team manager returns aggregated data from all teams", async () => {
    const bcryptjs = (await import("bcryptjs")).default;
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();

    const secondTeam = await prisma.team.create({
      data: {
        name: "Second Team",
        managerId: manager!.id,
      },
    });
    let wsSecond: { id: string } | null = null;
    let employeeSecondTeam: { id: string } | null = null;
    try {
      wsSecond = await prisma.workstation.create({
        data: { name: "Multi-team WS", teamId: secondTeam.id },
      });

      employeeSecondTeam = await prisma.user.create({
        data: {
          name: "Multi-team Employee",
          email: `multi-${Date.now()}@test.com`,
          passwordHash: await bcryptjs.hash("password", 10),
          role: "EMPLOYEE",
          teamId: secondTeam.id,
          workstations: {
            create: [{ workstationId: wsSecond.id }],
          },
        },
      });

      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const res = await agent.get("/api/manager/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.team).toBeDefined();
      const memberIds = (res.body.team.members as Array<{ id: string }>).map(
        (m) => m.id,
      );
      expect(memberIds).toContain(employeeSecondTeam.id);
      const workstationNames = (
        res.body.workstations as Array<{ name: string }>
      ).map((w) => w.name);
      expect(workstationNames).toContain("Multi-team WS");
    } finally {
      if (employeeSecondTeam) {
        await prisma.employeeWorkstation.deleteMany({
          where: { employeeId: employeeSecondTeam.id },
        });
        await prisma.user.delete({ where: { id: employeeSecondTeam.id } });
      }
      if (wsSecond)
        await prisma.workstation.delete({ where: { id: wsSecond.id } });
      await prisma.team.delete({ where: { id: secondTeam.id } });
    }
  });

  it("POST /api/tasks/templates as EMPLOYEE returns 403", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.post("/api/tasks/templates").send({
      title: "Test task",
      workstationId: "some-id",
      isRecurring: false,
    });

    expect(res.status).toBe(403);
  });

  it("POST /api/tasks/templates with workstation not in manager teams returns 404", async () => {
    const bcryptjs = (await import("bcryptjs")).default;
    const otherManager = await prisma.user.create({
      data: {
        name: "Other Manager",
        email: `other-mgr-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "MANAGER",
      },
    });
    const otherTeam = await prisma.team.create({
      data: { name: "Other Team", managerId: otherManager.id },
    });
    const otherWs = await prisma.workstation.create({
      data: { name: "Other WS", teamId: otherTeam.id },
    });
    try {
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const res = await agent.post("/api/tasks/templates").send({
        title: "Test",
        workstationId: otherWs.id,
        isRecurring: false,
      });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: "Not found" });
    } finally {
      await prisma.workstation.delete({ where: { id: otherWs.id } });
      await prisma.team.delete({ where: { id: otherTeam.id } });
      await prisma.user.delete({ where: { id: otherManager.id } });
    }
  });

  it("POST /api/tasks/templates with employee not in manager teams returns 404", async () => {
    const bcryptjs = (await import("bcryptjs")).default;
    const otherManager = await prisma.user.create({
      data: {
        name: "Other Manager",
        email: `other-mgr2-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "MANAGER",
      },
    });
    const otherTeam = await prisma.team.create({
      data: { name: "Other Team 2", managerId: otherManager.id },
    });
    const otherEmployee = await prisma.user.create({
      data: {
        name: "Other Emp",
        email: `other-emp-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
        teamId: otherTeam.id,
      },
    });
    try {
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const res = await agent.post("/api/tasks/templates").send({
        title: "Test",
        assignedToEmployeeId: otherEmployee.id,
        isRecurring: false,
      });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: "Not found" });
    } finally {
      await prisma.user.delete({ where: { id: otherEmployee.id } });
      await prisma.team.delete({ where: { id: otherTeam.id } });
      await prisma.user.delete({ where: { id: otherManager.id } });
    }
  });

  it("GET /api/tasks/templates returns templates for manager's teams", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
    const auth = withAuthCookie(agent, cookie);

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const ws = await prisma.workstation.create({
      data: { name: `WS GET ${Date.now()}`, teamId: manager!.teamId! },
    });

    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: "Test Template GET",
          workstationId: ws.id,
          createdById: manager!.id,
        },
      });
      templateId = template.id;

      const res = await auth.get("/api/tasks/templates");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((t: { id: string }) => t.id === template.id);
      expect(found).toBeTruthy();
      expect(found.title).toBe("Test Template GET");
    } finally {
      if (templateId) {
        await prisma.taskTemplate.delete({ where: { id: templateId } });
      }
      await prisma.workstation.delete({ where: { id: ws.id } });
    }
  });

  it("GET /api/tasks/templates as EMPLOYEE returns 403", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "emp@test.com", loginRes);
    const res = await withAuthCookie(agent, cookie).get("/api/tasks/templates");
    expect(res.status).toBe(403);
  });

  it("PATCH /api/tasks/templates/:id updates template", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
    const auth = withAuthCookie(agent, cookie);

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const ws = await prisma.workstation.create({
      data: { name: `WS PATCH ${Date.now()}`, teamId: manager!.teamId! },
    });

    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: "Original Title",
          description: "Original Description",
          workstationId: ws.id,
          createdById: manager!.id,
        },
      });
      templateId = template.id;

      const res = await auth.patch(`/api/tasks/templates/${templateId}`).send({
        title: "Updated Title",
        description: "Updated Description",
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated Title");
      expect(res.body.description).toBe("Updated Description");
    } finally {
      if (templateId) {
        await prisma.taskTemplate.delete({ where: { id: templateId } });
      }
      await prisma.workstation.delete({ where: { id: ws.id } });
    }
  });

  it("PATCH /api/tasks/templates/:id can clear description with null", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
    const auth = withAuthCookie(agent, cookie);

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const ws = await prisma.workstation.create({
      data: { name: `WS PATCH NULL ${Date.now()}`, teamId: manager!.teamId! },
    });

    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: "Test Template",
          description: "Has Description",
          workstationId: ws.id,
          createdById: manager!.id,
        },
      });
      templateId = template.id;

      const res = await auth.patch(`/api/tasks/templates/${templateId}`).send({
        description: null,
      });

      expect(res.status).toBe(200);
      expect(res.body.description).toBeNull();
    } finally {
      if (templateId) {
        await prisma.taskTemplate.delete({ where: { id: templateId } });
      }
      await prisma.workstation.delete({ where: { id: ws.id } });
    }
  });

  it("PATCH /api/tasks/templates/:id rejects update with both assignments null", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
    const auth = withAuthCookie(agent, cookie);

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const ws = await prisma.workstation.create({
      data: { name: `WS PATCH VALID ${Date.now()}`, teamId: manager!.teamId! },
    });

    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: "Test Template",
          workstationId: ws.id,
          createdById: manager!.id,
        },
      });
      templateId = template.id;

      const res = await auth.patch(`/api/tasks/templates/${templateId}`).send({
        workstationId: null,
        assignedToEmployeeId: null,
      });

      expect(res.status).toBe(400);
      // Zod refine returns "Validation error" with details; handler's final check returns custom message
      expect(
        res.body.error === "Validation error" ||
          (typeof res.body.error === "string" &&
            res.body.error.includes("must be provided")),
      ).toBe(true);
    } finally {
      if (templateId) {
        await prisma.taskTemplate.delete({ where: { id: templateId } });
      }
      await prisma.workstation.delete({ where: { id: ws.id } });
    }
  });

  it("DELETE /api/tasks/templates/:id deletes template", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
    const auth = withAuthCookie(agent, cookie);

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const ws = await prisma.workstation.create({
      data: { name: `WS DELETE ${Date.now()}`, teamId: manager!.teamId! },
    });

    let templateId: string | null = null;
    try {
      const template = await prisma.taskTemplate.create({
        data: {
          title: "Template to Delete",
          workstationId: ws.id,
          createdById: manager!.id,
        },
      });
      templateId = template.id;

      const res = await auth.delete(`/api/tasks/templates/${templateId}`);
      expect(res.status).toBe(204);

      const deleted = await prisma.taskTemplate.findUnique({
        where: { id: templateId },
      });
      expect(deleted).toBeNull();
    } finally {
      if (templateId) {
        // Cleanup in case delete failed
        await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
      }
      await prisma.workstation.delete({ where: { id: ws.id } });
    }
  });

  it("DELETE /api/tasks/templates/:id returns 404 for template not in manager teams", async () => {
    const bcryptjs = (await import("bcryptjs")).default;
    const otherManager = await prisma.user.create({
      data: {
        name: "Other Manager",
        email: `other-mgr-del-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "MANAGER",
      },
    });
    const otherTeam = await prisma.team.create({
      data: { name: "Other Team", managerId: otherManager.id },
    });
    const otherWs = await prisma.workstation.create({
      data: { name: "Other WS", teamId: otherTeam.id },
    });
    let templateId: string | null = null;
    try {
      templateId = (
        await prisma.taskTemplate.create({
          data: {
            title: "Other Template",
            workstationId: otherWs.id,
            createdById: otherManager.id,
          },
        })
      ).id;

      const agent = request.agent(app);
      const loginRes = await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
      const auth = withAuthCookie(agent, cookie);

      const res = await auth.delete(`/api/tasks/templates/${templateId}`);
      expect(res.status).toBe(404);
    } finally {
      if (templateId) {
        await prisma.taskTemplate.delete({ where: { id: templateId } });
      }
      await prisma.workstation.delete({ where: { id: otherWs.id } });
      await prisma.team.delete({ where: { id: otherTeam.id } });
      await prisma.user.delete({ where: { id: otherManager.id } });
    }
  });

  it("GET /api/tasks/templates filters out cross-team relationships (legacy data)", async () => {
    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
    const auth = withAuthCookie(agent, cookie);

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    // Create another manager/team for cross-team scenario
    const bcryptjs = (await import("bcryptjs")).default;
    const otherManager = await prisma.user.create({
      data: {
        name: "Other Manager",
        email: `other-mgr-legacy-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "MANAGER",
      },
    });
    const otherTeam = await prisma.team.create({
      data: { name: "Other Team Legacy", managerId: otherManager.id },
    });
    const otherWs = await prisma.workstation.create({
      data: { name: "Other WS Legacy", teamId: otherTeam.id },
    });
    const otherEmployee = await prisma.user.create({
      data: {
        name: "Other Employee",
        email: `other-emp-legacy-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
        teamId: otherTeam.id,
      },
    });

    const ws = await prisma.workstation.create({
      data: { name: `WS Legacy ${Date.now()}`, teamId: manager!.teamId! },
    });

    let templateId: string | null = null;
    try {
      // Create template with workstation in managed team but assignedToEmployee in other team
      // This simulates legacy inconsistent data.
      // BYPASS_PATTERN: $executeRawUnsafe is used only here (and in invalid-role test) to bypass
      // Prisma invariants and create data that the app would never create. Do not use in application
      // code; restrict to tests that explicitly need inconsistent/legacy data.
      templateId = `legacy-template-${Date.now()}`;
      // SQLite stores booleans as integers (0/1)
      await prisma.$executeRawUnsafe(
        `INSERT INTO TaskTemplate (id, title, "workstationId", "assignedToEmployeeId", "createdById", "isRecurring", "notifyEmployee", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        templateId,
        "Cross-team Template",
        ws.id,
        otherEmployee.id,
        manager!.id,
        0, // false as integer for SQLite
        0, // false as integer for SQLite
      );

      // Verify authentication still works after DB operations
      const profileCheckRes = await auth.get("/api/auth/profile");
      expect(profileCheckRes.status).toBe(200);
      expect(profileCheckRes.body.user.email).toBe("mgr@test.com");

      const res = await auth.get("/api/tasks/templates");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const found = res.body.find((t: { id: string }) => t.id === templateId);
      expect(found).toBeTruthy();
      expect(found.title).toBe("Cross-team Template");

      // Workstation should be exposed (belongs to managed team)
      expect(found.workstation).toBeTruthy();
      expect(found.workstation.id).toBe(ws.id);

      // assignedToEmployee and assignedToEmployeeId must be null (cross-team, no ID leak)
      expect(found.assignedToEmployee).toBeNull();
      expect(found.assignedToEmployeeId).toBeNull();
    } finally {
      if (templateId) {
        await prisma.taskTemplate.delete({ where: { id: templateId } });
      }
      await prisma.workstation.delete({ where: { id: ws.id } });
      await prisma.user.delete({ where: { id: otherEmployee.id } });
      await prisma.workstation.delete({ where: { id: otherWs.id } });
      await prisma.team.delete({ where: { id: otherTeam.id } });
      await prisma.user.delete({ where: { id: otherManager.id } });
    }
  });

  it("POST /api/tasks/templates with workstation existing but teamId null returns 404", async () => {
    const wsNoTeam = await prisma.workstation.create({
      data: { name: "Orphan WS" },
    });
    try {
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const res = await agent.post("/api/tasks/templates").send({
        title: "Test",
        workstationId: wsNoTeam.id,
        isRecurring: false,
      });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: "Not found" });
    } finally {
      await prisma.workstation.delete({ where: { id: wsNoTeam.id } });
    }
  });

  it("POST /api/tasks/templates with employee existing but teamId null returns 404", async () => {
    const bcryptjs = (await import("bcryptjs")).default;
    const empNoTeam = await prisma.user.create({
      data: {
        name: "Orphan Emp",
        email: `orphan-emp-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
      },
    });
    try {
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const res = await agent.post("/api/tasks/templates").send({
        title: "Test",
        assignedToEmployeeId: empNoTeam.id,
        isRecurring: false,
      });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: "Not found" });
    } finally {
      await prisma.user.delete({ where: { id: empNoTeam.id } });
    }
  });

  it("POST /api/tasks/templates with assignedToEmployeeId as MANAGER returns 404", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const res = await agent.post("/api/tasks/templates").send({
      title: "Test",
      assignedToEmployeeId: manager!.id,
      isRecurring: false,
    });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Not found" });
  });

  it("POST /api/tasks/templates with workstation and employee from different teams returns 400", async () => {
    const bcryptjs = (await import("bcryptjs")).default;
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team1 = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team1).not.toBeNull();
    const secondTeam = await prisma.team.create({
      data: { name: "Second Team Same Mgr", managerId: manager!.id },
    });
    const wsTeam1 = await prisma.workstation.findFirst({
      where: { teamId: team1!.id },
      select: { id: true },
    });
    const empTeam2 = await prisma.user.create({
      data: {
        name: "Emp Team 2",
        email: `emp-t2-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
        teamId: secondTeam.id,
      },
    });
    try {
      expect(wsTeam1).not.toBeNull();
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const res = await agent.post("/api/tasks/templates").send({
        title: "Test",
        workstationId: wsTeam1!.id,
        assignedToEmployeeId: empTeam2.id,
        isRecurring: false,
      });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        error: TASK_TEMPLATE_SAME_TEAM_MESSAGE,
      });
    } finally {
      await prisma.user.delete({ where: { id: empTeam2.id } });
      await prisma.team.delete({ where: { id: secondTeam.id } });
    }
  });

  it("POST /api/tasks/templates with workstation and employee in same team returns 201", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team).not.toBeNull();
    const workstation = await prisma.workstation.findFirst({
      where: { teamId: team!.id },
      select: { id: true },
    });
    const employee = await prisma.user.findFirst({
      where: { teamId: team!.id, role: "EMPLOYEE" },
      select: { id: true },
    });
    expect(workstation).not.toBeNull();
    expect(employee).not.toBeNull();
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const res = await agent.post("/api/tasks/templates").send({
      title: "Same-team task",
      workstationId: workstation!.id,
      assignedToEmployeeId: employee!.id,
      isRecurring: false,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.workstation).toBeDefined();
    expect(res.body.assignedToEmployee).toBeDefined();
    await prisma.taskTemplate
      .delete({ where: { id: res.body.id } })
      .catch(() => {});
  });

  it("TaskTemplate invariant: direct Prisma create with cross-team workstation and employee throws", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team1 = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team1).not.toBeNull();
    const secondTeam = await prisma.team.create({
      data: { name: "Second Team Invariant", managerId: manager!.id },
    });
    const wsTeam1 = await prisma.workstation.findFirst({
      where: { teamId: team1!.id },
      select: { id: true },
    });
    const bcryptjs = (await import("bcryptjs")).default;
    const empTeam2 = await prisma.user.create({
      data: {
        name: "Emp Team 2 Inv",
        email: `emp-inv-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
        teamId: secondTeam.id,
      },
    });
    try {
      expect(wsTeam1).not.toBeNull();
      await expect(
        prisma.taskTemplate.create({
          data: {
            title: "Cross-team template",
            createdById: manager!.id,
            workstationId: wsTeam1!.id,
            assignedToEmployeeId: empTeam2.id,
            isRecurring: false,
          },
        }),
      ).rejects.toThrow(TASK_TEMPLATE_SAME_TEAM_MESSAGE);
    } finally {
      await prisma.user.delete({ where: { id: empTeam2.id } });
      await prisma.team.delete({ where: { id: secondTeam.id } });
    }
  });

  it("TaskTemplate invariant: direct Prisma update with cross-team workstation/employee throws", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team1 = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team1).not.toBeNull();
    const wsTeam1 = await prisma.workstation.findFirst({
      where: { teamId: team1!.id },
      select: { id: true },
    });
    const empTeam1 = await prisma.user.findFirst({
      where: { teamId: team1!.id, role: "EMPLOYEE" },
      select: { id: true },
    });
    expect(wsTeam1).not.toBeNull();
    expect(empTeam1).not.toBeNull();

    const bcryptjs = (await import("bcryptjs")).default;
    const secondTeam = await prisma.team.create({
      data: { name: "Second Team Update Inv", managerId: manager!.id },
    });
    const empTeam2 = await prisma.user.create({
      data: {
        name: "Emp Team 2 Update Inv",
        email: `emp-inv-upd-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
        teamId: secondTeam.id,
      },
    });

    const template = await prisma.taskTemplate.create({
      data: {
        title: "Same-team template",
        createdById: manager!.id,
        workstationId: wsTeam1!.id,
        assignedToEmployeeId: empTeam1!.id,
        isRecurring: false,
      },
    });

    try {
      await expect(
        prisma.taskTemplate.update({
          where: { id: template.id },
          data: {
            assignedToEmployeeId: { set: empTeam2.id },
          },
        }),
      ).rejects.toThrow(TASK_TEMPLATE_SAME_TEAM_MESSAGE);
    } finally {
      await prisma.taskTemplate
        .delete({ where: { id: template.id } })
        .catch(() => {});
      await prisma.user.delete({ where: { id: empTeam2.id } });
      await prisma.team.delete({ where: { id: secondTeam.id } });
    }
  });

  it("TaskTemplate invariant: direct Prisma upsert (update path) with cross-team workstation/employee throws", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team1 = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team1).not.toBeNull();
    const wsTeam1 = await prisma.workstation.findFirst({
      where: { teamId: team1!.id },
      select: { id: true },
    });
    const empTeam1 = await prisma.user.findFirst({
      where: { teamId: team1!.id, role: "EMPLOYEE" },
      select: { id: true },
    });
    expect(wsTeam1).not.toBeNull();
    expect(empTeam1).not.toBeNull();

    const bcryptjs = (await import("bcryptjs")).default;
    const secondTeam = await prisma.team.create({
      data: { name: "Second Team Upsert Inv", managerId: manager!.id },
    });
    const empTeam2 = await prisma.user.create({
      data: {
        name: "Emp Team 2 Upsert Inv",
        email: `emp-inv-upsert-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
        teamId: secondTeam.id,
      },
    });

    const template = await prisma.taskTemplate.create({
      data: {
        title: "Same-team template upsert",
        createdById: manager!.id,
        workstationId: wsTeam1!.id,
        assignedToEmployeeId: empTeam1!.id,
        isRecurring: false,
      },
    });

    try {
      await expect(
        prisma.taskTemplate.upsert({
          where: { id: template.id },
          create: {
            title: "Should not be used",
            createdById: manager!.id,
            workstationId: wsTeam1!.id,
            assignedToEmployeeId: empTeam2.id,
            isRecurring: false,
          },
          update: {
            assignedToEmployeeId: { set: empTeam2.id },
          },
        }),
      ).rejects.toThrow(TASK_TEMPLATE_SAME_TEAM_MESSAGE);
    } finally {
      await prisma.taskTemplate
        .delete({ where: { id: template.id } })
        .catch(() => {});
      await prisma.user.delete({ where: { id: empTeam2.id } });
      await prisma.team.delete({ where: { id: secondTeam.id } });
    }
  });

  it("TaskTemplate invariant: direct Prisma upsert (create path) with cross-team workstation/employee throws", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team1 = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team1).not.toBeNull();
    const wsTeam1 = await prisma.workstation.findFirst({
      where: { teamId: team1!.id },
      select: { id: true },
    });
    expect(wsTeam1).not.toBeNull();

    const bcryptjs = (await import("bcryptjs")).default;
    const secondTeam = await prisma.team.create({
      data: { name: "Second Team Upsert Create Inv", managerId: manager!.id },
    });
    const empTeam2 = await prisma.user.create({
      data: {
        name: "Emp Team 2 Upsert Create Inv",
        email: `emp-inv-upsert-create-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "EMPLOYEE",
        teamId: secondTeam.id,
      },
    });

    const nonExistingId = "tasktpl_" + Date.now().toString();

    try {
      await expect(
        prisma.taskTemplate.upsert({
          where: { id: nonExistingId },
          create: {
            id: nonExistingId,
            title: "Cross-team upsert create",
            createdById: manager!.id,
            workstationId: wsTeam1!.id,
            assignedToEmployeeId: empTeam2.id,
            isRecurring: false,
          },
          update: {},
        }),
      ).rejects.toThrow(TASK_TEMPLATE_SAME_TEAM_MESSAGE);
    } finally {
      await prisma.user.delete({ where: { id: empTeam2.id } });
      await prisma.team.delete({ where: { id: secondTeam.id } });
    }
  });

  it("TaskTemplate invariant: updateMany that touches workstation/employee IDs is forbidden", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team1 = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team1).not.toBeNull();
    const wsTeam1 = await prisma.workstation.findFirst({
      where: { teamId: team1!.id },
      select: { id: true },
    });
    expect(wsTeam1).not.toBeNull();

    await expect(
      prisma.taskTemplate.updateMany({
        where: { workstationId: wsTeam1!.id },
        data: { assignedToEmployeeId: { set: null } },
      }),
    ).rejects.toThrow(TASK_TEMPLATE_BULK_UPDATE_FORBIDDEN_MESSAGE);
  });

  it("TaskTemplate invariant: invalid linkage payload set value surfaces explicit 400 error", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true },
    });
    expect(manager).not.toBeNull();
    const team = await prisma.team.findFirst({
      where: { managerId: manager!.id },
      select: { id: true },
    });
    expect(team).not.toBeNull();
    const workstation = await prisma.workstation.findFirst({
      where: { teamId: team!.id },
      select: { id: true },
    });
    expect(workstation).not.toBeNull();

    const template = await prisma.taskTemplate.create({
      data: {
        title: "Invalid linkage payload test",
        createdById: manager!.id,
        workstationId: workstation!.id,
        isRecurring: false,
      },
    });

    try {
      await expect(
        prisma.taskTemplate.update({
          where: { id: template.id },
          // @ts-expect-error – intentional invalid payload for invariant middleware
          data: { assignedToEmployeeId: { set: 123 } },
        }),
      ).rejects.toThrow("Invalid TaskTemplate linkage payload");
    } finally {
      await prisma.taskTemplate
        .delete({ where: { id: template.id } })
        .catch(() => {});
    }
  });
});

describe("Daily tasks API", () => {
  it("GET /api/tasks/daily without auth returns 401", async () => {
    const res = await request(app).get("/api/tasks/daily");
    expect(res.status).toBe(401);
  });

  it("GET /api/tasks/daily with valid employee cookie returns 200 and array", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/tasks/daily");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/tasks/daily?date=YYYY-MM-DD returns 200 and array for that date", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/tasks/daily?date=2025-02-15");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/tasks/daily?date=invalid returns 400 with message", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/tasks/daily?date=not-a-date");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("GET /api/tasks/daily?date=2025-02-31 returns 400 (invalid calendar date)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/tasks/daily?date=2025-02-31");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("GET /api/tasks/daily with non-string date query returns 400 (invalid type)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    // Express will parse this into req.query.date as an object, not a string
    const res = await agent
      .get("/api/tasks/daily")
      .query({ date: { foo: "bar" } });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("GET /api/tasks/daily with date[foo]=bar returns 400 (malformed date query)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent
      .get("/api/tasks/daily")
      .query({ "date[foo]": "bar" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("GET /api/tasks/daily with date and date[foo] together returns 400 (strict policy)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent
      .get("/api/tasks/daily")
      .query({ date: "2025-02-15", "date[foo]": "bar" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("PATCH /api/tasks/daily/:taskId without auth returns 401", async () => {
    const res = await request(app)
      .patch("/api/tasks/daily/some-id")
      .send({ isCompleted: true });

    expect(res.status).toBe(401);
  });

  it("PATCH /api/tasks/daily with whitespace-only taskId returns 400 (Invalid task ID)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    // Space as taskId: paramString trims to empty and returns null -> 400
    const res = await agent
      .patch("/api/tasks/daily/%20")
      .send({ isCompleted: true });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Invalid task ID" });
  });

  it("PATCH /api/tasks/daily/:taskId with non-existent taskId returns 404", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent
      .patch("/api/tasks/daily/00000000-0000-0000-0000-000000000000")
      .send({ isCompleted: true });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Task not found" });
  });

  it("PATCH /api/tasks/daily/:taskId with valid employee and own task returns 200", async () => {
    const employee = await prisma.user.findUnique({
      where: { email: "emp@test.com" },
      select: { id: true },
    });
    expect(employee).not.toBeNull();

    const dailyTask = await prisma.dailyTask.findFirst({
      where: { employeeId: employee!.id },
      select: { id: true, isCompleted: true },
    });
    expect(dailyTask).not.toBeNull();

    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const newCompleted = !dailyTask!.isCompleted;
    const res = await agent
      .patch(`/api/tasks/daily/${dailyTask!.id}`)
      .send({ isCompleted: newCompleted });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isCompleted: newCompleted });
  });

  it("PATCH /api/tasks/daily/:taskId with missing isCompleted returns 400 (validation)", async () => {
    const employee = await prisma.user.findUnique({
      where: { email: "emp@test.com" },
      select: { id: true },
    });
    expect(employee).not.toBeNull();

    const dailyTask = await prisma.dailyTask.findFirst({
      where: { employeeId: employee!.id },
      select: { id: true },
    });
    expect(dailyTask).not.toBeNull();

    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.patch(`/api/tasks/daily/${dailyTask!.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Validation error" });
    expect(res.body.details).toBeDefined();
    const details = res.body.details as z.ZodIssue[];
    const isCompletedError = details.find(
      (e) => Array.isArray(e.path) && e.path.includes("isCompleted"),
    );
    expect(isCompletedError).toBeDefined();
    expect(isCompletedError!.code).toBe("invalid_type");
    expect(isCompletedError!.message).toBeDefined();
  });

  it("PATCH /api/tasks/daily/:taskId with non-boolean isCompleted returns 400 (validation)", async () => {
    const employee = await prisma.user.findUnique({
      where: { email: "emp@test.com" },
      select: { id: true },
    });
    expect(employee).not.toBeNull();

    const dailyTask = await prisma.dailyTask.findFirst({
      where: { employeeId: employee!.id },
      select: { id: true },
    });
    expect(dailyTask).not.toBeNull();

    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent
      .patch(`/api/tasks/daily/${dailyTask!.id}`)
      .send({ isCompleted: "true" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Validation error" });
    expect(res.body.details).toBeDefined();
    const details = res.body.details as z.ZodIssue[];
    const isCompletedError = details.find(
      (e) => Array.isArray(e.path) && e.path.includes("isCompleted"),
    );
    expect(isCompletedError).toBeDefined();
    expect(isCompletedError!.code).toBe("invalid_type");
    expect(isCompletedError!.message).toBeDefined();
  });

  it("PATCH /api/tasks/daily/:taskId as employee on another employee's task returns 403", async () => {
    const otherEmployee = await prisma.user.findUnique({
      where: { email: "carol@test.com" },
      select: { id: true },
    });
    expect(otherEmployee).not.toBeNull();

    const otherTask = await prisma.dailyTask.findFirst({
      where: { employeeId: otherEmployee!.id },
      select: { id: true, isCompleted: true, completedAt: true },
    });
    expect(otherTask).not.toBeNull();

    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent
      .patch(`/api/tasks/daily/${otherTask!.id}`)
      .send({ isCompleted: true });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });

    const after = await prisma.dailyTask.findUnique({
      where: { id: otherTask!.id },
      select: { isCompleted: true, completedAt: true },
    });
    expect(after).not.toBeNull();
    expect(after!.isCompleted).toBe(otherTask!.isCompleted);
    expect(after!.completedAt?.getTime() ?? null).toBe(
      otherTask!.completedAt?.getTime() ?? null,
    );
  });
});

describe("Cron API", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  it("POST /api/cron/daily-tasks with missing x-cron-secret returns 401", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const res = await request(app).post("/api/cron/daily-tasks");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
  });

  it("POST /api/cron/daily-tasks with CRON_SECRET not configured returns 503", async () => {
    delete process.env.CRON_SECRET;

    const res = await request(app).post("/api/cron/daily-tasks");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("Cron endpoint is disabled"),
    });
  });

  it("POST /api/cron/daily-tasks with wrong x-cron-secret returns 401", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const res = await request(app)
      .post("/api/cron/daily-tasks")
      .set("x-cron-secret", "wrong-secret");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
  });

  it("POST /api/cron/daily-tasks with invalid date returns 400 (route + auth + validation)", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const res = await request(app)
      .post("/api/cron/daily-tasks?date=2025-02-31")
      .set("x-cron-secret", "test-cron-secret");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("POST /api/cron/daily-tasks with date[foo]=bar returns 400 (malformed date query)", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const res = await request(app)
      .post("/api/cron/daily-tasks")
      .query({ "date[foo]": "bar" })
      .set("x-cron-secret", "test-cron-secret");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("POST /api/cron/daily-tasks with date and date[foo] together returns 400 (strict policy)", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const res = await request(app)
      .post("/api/cron/daily-tasks")
      .query({ date: "2025-02-15", "date[foo]": "bar" })
      .set("x-cron-secret", "test-cron-secret");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("YYYY-MM-DD"),
    });
  });

  it("POST /api/cron/daily-tasks with valid secret and date returns 200 (happy path)", async () => {
    process.env.CRON_SECRET = "test-cron-secret";

    const res = await request(app)
      .post("/api/cron/daily-tasks?date=2025-02-15")
      .set("x-cron-secret", "test-cron-secret");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, date: "2025-02-15" });
    expect(Number.isInteger(res.body.created)).toBe(true);
    expect(Number.isInteger(res.body.skipped)).toBe(true);
    expect(res.body.created).toBeGreaterThanOrEqual(0);
    expect(res.body.skipped).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/cron/daily-tasks respects rate limit (max 2/min in non-test mode)", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalCronSecret = process.env.CRON_SECRET;
    const originalDisableCsrf = process.env.DISABLE_CSRF;

    try {
      process.env.NODE_ENV = "development"; // Non-test mode to enforce rate limit
      process.env.CRON_SECRET = "test-cron-secret";
      process.env.DISABLE_CSRF = "true"; // Avoid 403 from CSRF when NODE_ENV is development
      // Create new app after env change to ensure rate limiter uses correct config
      const limitedApp = createApp();

      // First request should succeed
      const res1 = await request(limitedApp)
        .post("/api/cron/daily-tasks?date=2025-02-15")
        .set("x-cron-secret", "test-cron-secret");
      expect(res1.status).toBe(200);

      // Second request should succeed (max is 2/min)
      const res2 = await request(limitedApp)
        .post("/api/cron/daily-tasks?date=2025-02-15")
        .set("x-cron-secret", "test-cron-secret");
      expect(res2.status).toBe(200);

      // Third request should be rate limited
      const res3 = await request(limitedApp)
        .post("/api/cron/daily-tasks?date=2025-02-15")
        .set("x-cron-secret", "test-cron-secret");
      expect(res3.status).toBe(429);
      expect(res3.body).toMatchObject({
        error: expect.stringContaining("Too many cron requests"),
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = originalCronSecret;
      if (originalDisableCsrf === undefined) delete process.env.DISABLE_CSRF;
      else process.env.DISABLE_CSRF = originalDisableCsrf;
    }
  });

  it("POST /api/cron/daily-tasks rejects invalid secrets without consuming rate limit quota", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalCronSecret = process.env.CRON_SECRET;
    const originalDisableCsrf = process.env.DISABLE_CSRF;

    try {
      process.env.NODE_ENV = "development";
      process.env.CRON_SECRET = "test-cron-secret";
      process.env.DISABLE_CSRF = "true"; // Avoid 403 from CSRF when NODE_ENV is development
      const limitedApp = createApp();

      // Send many requests with invalid secret - should all be rejected immediately
      for (let i = 0; i < 10; i++) {
        const res = await request(limitedApp)
          .post("/api/cron/daily-tasks?date=2025-02-15")
          .set("x-cron-secret", "wrong-secret");
        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ error: "Unauthorized" });
      }

      // Valid secret requests should still work (quota not consumed by invalid requests)
      const validRes = await request(limitedApp)
        .post("/api/cron/daily-tasks?date=2025-02-15")
        .set("x-cron-secret", "test-cron-secret");
      expect(validRes.status).toBe(200);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = originalCronSecret;
      if (originalDisableCsrf === undefined) delete process.env.DISABLE_CSRF;
      else process.env.DISABLE_CSRF = originalDisableCsrf;
    }
  });
});

describe("Security middlewares", () => {
  describe("CSRF validation", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDisableCsrf = process.env.DISABLE_CSRF;

    beforeAll(() => {
      process.env.NODE_ENV = "development";
      process.env.DISABLE_CSRF = "false";
    });

    afterAll(() => {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalDisableCsrf === undefined) {
        delete process.env.DISABLE_CSRF;
      } else {
        process.env.DISABLE_CSRF = originalDisableCsrf;
      }
    });

    it("rejects requests with missing or invalid CSRF token", () => {
      const req = {
        method: "POST",
        path: "/api/auth/login",
        headers: { "x-csrf-token": "header-token" },
        cookies: { "csrf-token": "cookie-token" },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn<NextFunction>();

      validateCsrf(req, res, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid CSRF token" });
      expect(next).not.toHaveBeenCalled();
    });

    it("allows requests with matching CSRF header and cookie", () => {
      const req = {
        method: "POST",
        path: "/api/auth/login",
        headers: { "x-csrf-token": "same-token" },
        cookies: { "csrf-token": "same-token" },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn<NextFunction>();

      validateCsrf(req, res, next as unknown as NextFunction);

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("Rate limiting", () => {
    it("limits repeated login attempts after a threshold", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDisableCsrf = process.env.DISABLE_CSRF;
      try {
        process.env.NODE_ENV = "development";
        process.env.DISABLE_CSRF = "true";
        const limitedApp = createApp();

        const agent = request(limitedApp);

        // Exceed the non-test authLimiter max (20) with invalid credentials
        for (let i = 0; i < 21; i++) {
          await agent
            .post("/api/auth/login")
            .send({ email: "mgr@test.com", password: "wrongpassword" });
        }

        const res = await agent
          .post("/api/auth/login")
          .send({ email: "mgr@test.com", password: "wrongpassword" });

        expect(res.status).toBe(429);
        expect(res.body).toMatchObject({
          error: "Too many attempts, please try again later",
        });
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalDisableCsrf === undefined) delete process.env.DISABLE_CSRF;
        else process.env.DISABLE_CSRF = originalDisableCsrf;
      }
    });

    it("allows requests again after rate limit window expires", async () => {
      vi.useFakeTimers({ now: new Date("2025-01-15T10:00:00Z").getTime() });
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDisableCsrf = process.env.DISABLE_CSRF;
      try {
        process.env.NODE_ENV = "development";
        process.env.DISABLE_CSRF = "true";
        const limitedApp = createApp();

        const agent = request(limitedApp);
        const windowMs = 15 * 60 * 1000;

        for (let i = 0; i < 20; i++) {
          await agent
            .post("/api/auth/login")
            .send({ email: "mgr@test.com", password: "wrongpassword" });
        }
        const afterLimit = await agent
          .post("/api/auth/login")
          .send({ email: "mgr@test.com", password: "wrongpassword" });
        expect(afterLimit.status).toBe(429);

        vi.advanceTimersByTime(windowMs + 1);

        const afterWindow = await agent
          .post("/api/auth/login")
          .send({ email: "mgr@test.com", password: "wrongpassword" });
        expect(afterWindow.status).toBe(401);
        expect(afterWindow.body?.error).not.toBe(
          "Too many attempts, please try again later",
        );
      } finally {
        vi.useRealTimers();
        process.env.NODE_ENV = originalNodeEnv;
        if (originalDisableCsrf === undefined) delete process.env.DISABLE_CSRF;
        else process.env.DISABLE_CSRF = originalDisableCsrf;
      }
    });
  });
});

describe("Workstations and employees API", () => {
  it("GET /api/workstations without auth returns 401", async () => {
    const res = await request(app).get("/api/workstations");
    expect(res.status).toBe(401);
  });

  it("GET /api/workstations as EMPLOYEE returns 403", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/workstations");

    expect(res.status).toBe(403);
  });

  it("GET /api/workstations as MANAGER returns 200 and array", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const res = await agent.get("/api/workstations");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/workstations as MANAGER creates a workstation", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const name = `Test WS ${Date.now()}`;
    const res = await agent.post("/api/workstations").send({ name });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name });
  });

  it("POST /api/workstations duplicate (teamId, name) returns 400 (name unique per team)", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const cookie = await assertLoggedIn(agent, "mgr@test.com", loginRes);
    const auth = withAuthCookie(agent, cookie);

    const name = `dup-name-${Date.now()}`;
    const first = await auth
      .post("/api/workstations")
      .send({ name, teamId: manager!.teamId! });
    expect(first.status).toBe(201);

    const second = await auth
      .post("/api/workstations")
      .send({ name, teamId: manager!.teamId! });
    // Route checks duplicate explicitly and returns 400 (not Prisma P2002 → 409)
    expect(second.status).toBe(400);
    expect(second.body).toMatchObject({
      error: "A workstation with this name already exists in your team",
    });

    await prisma.workstation
      .delete({ where: { id: first.body.id } })
      .catch(() => {});
  });

  it("POST /api/workstations with valid teamId creates workstation in that team", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const name = `Test WS teamId ${Date.now()}`;
    let createdId: string | null = null;
    try {
      const res = await agent
        .post("/api/workstations")
        .send({ name, teamId: manager!.teamId! });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name, teamId: manager!.teamId! });
      createdId = res.body.id;
    } finally {
      if (createdId)
        await prisma.workstation.delete({ where: { id: createdId } });
    }
  });

  it("POST /api/workstations with teamId not managed by manager returns 403", async () => {
    const bcryptjs = (await import("bcryptjs")).default;
    const otherManager = await prisma.user.create({
      data: {
        name: "Other Manager",
        email: `other-mgr-${Date.now()}@test.com`,
        passwordHash: await bcryptjs.hash("password", 10),
        role: "MANAGER",
      },
    });
    const otherTeam = await prisma.team.create({
      data: { name: "Other Manager Team", managerId: otherManager.id },
    });

    try {
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });

      const res = await agent.post("/api/workstations").send({
        name: "Should Fail",
        teamId: otherTeam.id,
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe(
        "Team not found or you do not manage this team.",
      );
    } finally {
      await prisma.team.delete({ where: { id: otherTeam.id } });
      await prisma.user.delete({ where: { id: otherManager.id } });
    }
  });

  it("POST /api/employees as MANAGER creates employee with workstation assignment", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { teamId: true },
    });

    expect(manager?.teamId).toBeTruthy();

    const workstation = await prisma.workstation.findFirst({
      where: { teamId: manager!.teamId! },
      select: { id: true, name: true },
    });

    expect(workstation).not.toBeNull();

    const email = `new-emp-${Date.now()}@test.com`;
    const res = await agent.post("/api/employees").send({
      name: "New Employee",
      email,
      workstationIds: [workstation!.id],
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "New Employee",
      email,
      role: "EMPLOYEE",
    });
    expect(Array.isArray(res.body.workstations)).toBe(true);
    expect(res.body.workstations.length).toBeGreaterThan(0);
  });

  it("POST /api/employees with duplicate workstationIds returns 400 (validation)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const workstation = await prisma.workstation.findFirst({
      where: { teamId: manager!.teamId! },
      select: { id: true },
    });
    expect(workstation).not.toBeNull();

    const res = await agent.post("/api/employees").send({
      name: "Dup Employee",
      email: `dup-emp-${Date.now()}@test.com`,
      workstationIds: [workstation!.id, workstation!.id],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
    expect(res.body.details).toBeDefined();
  });

  it("POST /api/employees with workstations from two different teams returns 400", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const wsTeam1 = await prisma.workstation.findFirst({
      where: { teamId: manager!.teamId! },
      select: { id: true },
    });
    expect(wsTeam1).not.toBeNull();

    const secondTeam = await prisma.team.create({
      data: { name: "Other Team", managerId: manager!.id },
    });
    const wsTeam2 = await prisma.workstation.create({
      data: { name: "WS Other Team", teamId: secondTeam.id },
    });

    try {
      const agent = request.agent(app);
      await agent
        .post("/api/auth/login")
        .send({ email: "mgr@test.com", password: "password" });
      const res = await agent.post("/api/employees").send({
        name: "Cross-team Employee",
        email: `cross-${Date.now()}@test.com`,
        workstationIds: [wsTeam1!.id, wsTeam2.id],
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/same team/);
    } finally {
      await prisma.workstation.delete({ where: { id: wsTeam2.id } });
      await prisma.team.delete({ where: { id: secondTeam.id } });
    }
  });

  it("POST /api/employees creates daily tasks from workstation templates (createMany non-regression)", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const ws1 = await prisma.workstation.create({
      data: { name: `WS Daily ${Date.now()}`, teamId: manager!.teamId! },
    });
    const ws2 = await prisma.workstation.create({
      data: { name: `WS Daily 2 ${Date.now()}`, teamId: manager!.teamId! },
    });

    let employeeId: string | null = null;
    try {
      await prisma.taskTemplate.create({
        data: {
          title: "Template A",
          workstationId: ws1.id,
          createdById: manager!.id,
        },
      });
      await prisma.taskTemplate.create({
        data: {
          title: "Template B",
          workstationId: ws2.id,
          createdById: manager!.id,
        },
      });

      const email = `daily-emp-${Date.now()}@test.com`;
      const createRes = await agent.post("/api/employees").send({
        name: "Daily Tasks Employee",
        email,
        workstationIds: [ws1.id, ws2.id],
      });

      expect(createRes.status).toBe(201);
      employeeId = createRes.body.id;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const dailyCount = await prisma.dailyTask.count({
        where: {
          employeeId: employeeId!,
          date: { gte: startOfDay, lt: endOfDay },
        },
      });
      expect(dailyCount).toBe(2);
    } finally {
      if (employeeId) {
        await prisma.dailyTask.deleteMany({ where: { employeeId } });
        await prisma.employeeWorkstation.deleteMany({ where: { employeeId } });
        await prisma.user.delete({ where: { id: employeeId } });
      }
      await prisma.taskTemplate.deleteMany({
        where: { workstationId: { in: [ws1.id, ws2.id] } },
      });
      await prisma.workstation.deleteMany({
        where: { id: { in: [ws1.id, ws2.id] } },
      });
    }
  });
});
