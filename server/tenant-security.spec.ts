import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import prisma from "./lib/db";
import { createApp } from "./index";
import { AUTH_COOKIE_NAME, generateToken, hashPassword } from "./lib/auth";
import { scopedPrisma } from "./security/scoped-prisma";

const app = createApp();

let managerAId: string;
let managerAEmail: string;
let teamAId: string;
let workstationAId: string;
let employeeAId: string;
let employeeAEmail: string;

let managerBId: string;
let managerBEmail: string;
let teamBId: string;
let workstationBId: string;
let employeeBId: string;
let taskBId: string;

function authCookie(user: {
  id: string;
  email: string;
  role: "MANAGER" | "EMPLOYEE";
}): string {
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  return `${AUTH_COOKIE_NAME}=${token}`;
}

describe("Tenant security", () => {
  beforeAll(async () => {
    managerAEmail = `tenant-mgr-a-${Date.now()}@test.com`;
    employeeAEmail = `tenant-emp-a-${Date.now()}@test.com`;
    managerBEmail = `tenant-mgr-b-${Date.now()}@test.com`;

    const managerA = await prisma.user.create({
      data: {
        name: "Manager A",
        email: managerAEmail,
        passwordHash: await hashPassword("password"),
        role: "MANAGER",
      },
      select: { id: true },
    });
    managerAId = managerA.id;

    const teamA = await prisma.team.create({
      data: {
        name: `Team A ${Date.now()}`,
        managerId: managerAId,
      },
      select: { id: true },
    });
    teamAId = teamA.id;

    await prisma.user.update({
      where: { id: managerAId },
      data: { teamId: teamAId },
    });

    const workstationA = await prisma.workstation.create({
      data: {
        name: `WS Team A ${Date.now()}`,
        teamId: teamAId,
      },
      select: { id: true },
    });
    workstationAId = workstationA.id;

    const employeeA = await prisma.user.create({
      data: {
        name: "Employee A",
        email: employeeAEmail,
        passwordHash: await hashPassword("password"),
        role: "EMPLOYEE",
        teamId: teamAId,
      },
      select: { id: true },
    });
    employeeAId = employeeA.id;

    const managerB = await prisma.user.create({
      data: {
        name: "Manager B",
        email: managerBEmail,
        passwordHash: await hashPassword("password"),
        role: "MANAGER",
      },
      select: { id: true },
    });
    managerBId = managerB.id;

    const teamB = await prisma.team.create({
      data: {
        name: `Team B ${Date.now()}`,
        managerId: managerBId,
      },
      select: { id: true },
    });
    teamBId = teamB.id;

    await prisma.user.update({
      where: { id: managerBId },
      data: { teamId: teamBId },
    });

    const workstationB = await prisma.workstation.create({
      data: {
        name: `WS Team B ${Date.now()}`,
        teamId: teamBId,
      },
      select: { id: true },
    });
    workstationBId = workstationB.id;

    const employeeB = await prisma.user.create({
      data: {
        name: "Employee B",
        email: `tenant-emp-b-${Date.now()}@test.com`,
        passwordHash: await hashPassword("password"),
        role: "EMPLOYEE",
        teamId: teamBId,
      },
      select: { id: true },
    });
    employeeBId = employeeB.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const taskB = await prisma.dailyTask.create({
      data: {
        employeeId: employeeBId,
        date: today,
        status: "ASSIGNED",
        isCompleted: false,
      },
      select: { id: true },
    });
    taskBId = taskB.id;
  });

  afterAll(async () => {
    if (taskBId) {
      await prisma.dailyTask
        .deleteMany({ where: { id: taskBId } })
        .catch(() => {});
    }
    if (employeeBId) {
      await prisma.user
        .deleteMany({ where: { id: employeeBId } })
        .catch(() => {});
    }
    if (workstationBId) {
      await prisma.workstation
        .deleteMany({ where: { id: workstationBId } })
        .catch(() => {});
    }
    if (teamBId) {
      await prisma.team.deleteMany({ where: { id: teamBId } }).catch(() => {});
    }
    if (managerBId) {
      await prisma.user
        .deleteMany({ where: { id: managerBId } })
        .catch(() => {});
    }

    if (employeeAId) {
      await prisma.user
        .deleteMany({ where: { id: employeeAId } })
        .catch(() => {});
    }
    if (workstationAId) {
      await prisma.workstation
        .deleteMany({ where: { id: workstationAId } })
        .catch(() => {});
    }
    if (teamAId) {
      await prisma.team.deleteMany({ where: { id: teamAId } }).catch(() => {});
    }
    if (managerAId) {
      await prisma.user
        .deleteMany({ where: { id: managerAId } })
        .catch(() => {});
    }
  });

  it("Manager A ne peut pas lire les workstations du tenant B", async () => {
    const managerACookie = authCookie({
      id: managerAId,
      email: managerAEmail,
      role: "MANAGER",
    });
    const res = await request(app)
      .get("/api/workstations")
      .set("Cookie", managerACookie);

    expect(res.status).toBe(200);
    const workstationIds = (res.body as Array<{ id: string }>).map(
      (ws) => ws.id,
    );
    expect(workstationIds).not.toContain(workstationBId);
  });

  it("Requete directe par ID externe retourne 403 pour un manager", async () => {
    const managerACookie = authCookie({
      id: managerAId,
      email: managerAEmail,
      role: "MANAGER",
    });
    const res = await request(app)
      .patch(`/api/tasks/daily/${taskBId}`)
      .set("Cookie", managerACookie)
      .send({ isCompleted: true });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
  });

  it("Employee ne peut pas modifier une task d'une autre team", async () => {
    const employeeACookie = authCookie({
      id: employeeAId,
      email: employeeAEmail,
      role: "EMPLOYEE",
    });
    const res = await request(app)
      .patch(`/api/tasks/daily/${taskBId}`)
      .set("Cookie", employeeACookie)
      .send({ isCompleted: true });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "Forbidden" });
  });

  it("scopedPrisma bloque findMany sans clause teamId explicite", async () => {
    const scoped = scopedPrisma({
      role: "MANAGER",
      userId: managerAId,
      teamIds: [teamAId],
    });

    await expect(scoped.workstation.findMany({})).rejects.toMatchObject({
      message: expect.stringContaining("Unsafe query blocked"),
    });
  });
});
