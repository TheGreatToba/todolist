/**
 * API integration tests for auth, permissions, and daily tasks.
 * Prerequisites: JWT_SECRET and DATABASE_URL in env (e.g. .env or CI). Run `pnpm seed` before tests.
 * Uses mgr@test.com (MANAGER) and emp@test.com (EMPLOYEE) with password "password".
 * Note: Auth uses httpOnly cookies; tests use supertest agent for cookie persistence.
 */
import "dotenv/config";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "./index";
import prisma from "./lib/db";

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
