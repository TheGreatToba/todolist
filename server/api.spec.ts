/**
 * API integration tests for auth, permissions, and daily tasks.
 * Prerequisites: JWT_SECRET and DATABASE_URL in env (e.g. .env or CI). Run `pnpm seed` before tests.
 * Uses mgr@test.com (MANAGER) and emp@test.com (EMPLOYEE) with password "password".
 * Note: Auth uses httpOnly cookies; tests use supertest agent for cookie persistence.
 */
import "dotenv/config";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { z } from "zod";
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
    expect(isCompletedError!.code).toBeDefined();
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
    expect(isCompletedError!.code).toBeDefined();
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

    try {
      process.env.NODE_ENV = "development"; // Non-test mode to enforce rate limit
      process.env.CRON_SECRET = "test-cron-secret";
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
    }
  });

  it("POST /api/cron/daily-tasks rejects invalid secrets without consuming rate limit quota", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalCronSecret = process.env.CRON_SECRET;

    try {
      process.env.NODE_ENV = "development";
      process.env.CRON_SECRET = "test-cron-secret";
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

  it("POST /api/workstations duplicate (teamId, name) returns 409 CONFLICT (P2002 non-email fallback)", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    const name = `P2002-fallback-${Date.now()}`;
    const first = await agent
      .post("/api/workstations")
      .send({ name, teamId: manager!.teamId! });
    expect(first.status).toBe(201);

    const second = await agent
      .post("/api/workstations")
      .send({ name, teamId: manager!.teamId! });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      error: "A record with this value already exists.",
      code: "CONFLICT",
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
