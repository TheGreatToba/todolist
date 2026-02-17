/**
 * API integration tests for auth, permissions, and daily tasks.
 * Prerequisites: JWT_SECRET and DATABASE_URL in env (e.g. .env or CI). Run `pnpm seed` before tests.
 * Uses mgr@test.com (MANAGER) and emp@test.com (EMPLOYEE) with password "password".
 * Note: Auth uses httpOnly cookies; tests use supertest agent for cookie persistence.
 */
import "dotenv/config";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "./index";
import prisma from "./lib/db";
import { validateCsrf } from "./lib/csrf";
import { redactEmailForLog, emailHashForLog } from "./routes/auth";
import type { Request, Response, NextFunction } from "express";

const app = createApp();

describe("Auth API", () => {
  it("POST /api/auth/signup with MANAGER returns 201 and user", async () => {
    const email = `mgr-${Date.now()}@test.com`;
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
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
    await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "password" });

    const res = await agent.get("/api/auth/profile");

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("mgr@test.com");
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

    await prisma.$executeRawUnsafe("UPDATE User SET role = ? WHERE id = ?", "INVALID", userId);

    const warnCalls: unknown[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((arg: unknown) => {
      warnCalls.push(arg);
    });
    const loginRes = await request(app).post("/api/auth/login").send({ email, password: "password123" });
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
    expect(log).toMatchObject({ event: "invalid_role_rejected", userId, email, role: "INVALID" });
    expect(log.endpoint).toBe("/api/auth/login");
  });

  it("production redacts email to ***@domain and adds stable emailHash", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(redactEmailForLog("user@test.com")).toBe("***@test.com");
      expect(redactEmailForLog("a@example.org")).toBe("***@example.org");
      expect(redactEmailForLog("no-at")).toBe("***");

      const hash = emailHashForLog("user@test.com");
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
      expect(emailHashForLog("user@test.com")).toBe(hash);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});

describe("Permissions - role-based access", () => {
  it("GET /api/manager/dashboard as EMPLOYEE returns 403", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/manager/dashboard");

    expect(res.status).toBe(403);
  });

  it("GET /api/manager/dashboard as MANAGER returns 200", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "password" });

    const res = await agent.get("/api/manager/dashboard");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dailyTasks");
  });

  it("POST /api/tasks/templates as EMPLOYEE returns 403", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "emp@test.com", password: "password" });

    const res = await agent
      .post("/api/tasks/templates")
      .send({
        title: "Test task",
        workstationId: "some-id",
        isRecurring: false,
      });

    expect(res.status).toBe(403);
  });
});

describe("Daily tasks API", () => {
  it("GET /api/tasks/daily without auth returns 401", async () => {
    const res = await request(app).get("/api/tasks/daily");
    expect(res.status).toBe(401);
  });

  it("GET /api/tasks/daily with valid employee cookie returns 200 and array", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/tasks/daily");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
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
      const next = vi.fn<Parameters<NextFunction>, void>();

      validateCsrf(req, res, next);

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
      const next = vi.fn<Parameters<NextFunction>, void>();

      validateCsrf(req, res, next);

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
          await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "wrongpassword" });
        }

        const res = await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "wrongpassword" });

        expect(res.status).toBe(429);
        expect(res.body).toMatchObject({ error: "Too many attempts, please try again later" });
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
          await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "wrongpassword" });
        }
        const afterLimit = await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "wrongpassword" });
        expect(afterLimit.status).toBe(429);

        vi.advanceTimersByTime(windowMs + 1);

        const afterWindow = await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "wrongpassword" });
        expect(afterWindow.status).toBe(401);
        expect(afterWindow.body?.error).not.toBe("Too many attempts, please try again later");
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
    await agent.post("/api/auth/login").send({ email: "emp@test.com", password: "password" });

    const res = await agent.get("/api/workstations");

    expect(res.status).toBe(403);
  });

  it("GET /api/workstations as MANAGER returns 200 and array", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "password" });

    const res = await agent.get("/api/workstations");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/workstations as MANAGER creates a workstation", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "password" });

    const name = `Test WS ${Date.now()}`;
    const res = await agent.post("/api/workstations").send({ name });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name });
  });

  it("POST /api/employees as MANAGER creates employee with workstation assignment", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "mgr@test.com", password: "password" });

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
});
