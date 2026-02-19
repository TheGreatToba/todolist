import "dotenv/config";
import { describe, it, expect } from "vitest";
import request from "supertest";
import prisma from "./lib/db";
import { createApp } from "./index";
import { hashPassword, verifyPassword } from "./lib/auth";

const app = createApp();

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function login(agent: ReturnType<typeof request.agent>, email: string) {
  const res = await agent
    .post("/api/auth/login")
    .send({ email, password: "password" });
  expect(res.status).toBe(200);
}

describe("SaaS evolutions API", () => {
  it("manager can complete an employee task", async () => {
    const employee = await prisma.user.findUnique({
      where: { email: "emp@test.com" },
      select: { id: true },
    });
    expect(employee).not.toBeNull();
    const task = await prisma.dailyTask.findFirst({
      where: { employeeId: employee!.id },
      select: { id: true, isCompleted: true },
    });
    expect(task).not.toBeNull();

    const agent = request.agent(app);
    await login(agent, "mgr@test.com");
    const res = await agent
      .patch(`/api/tasks/daily/${task!.id}`)
      .send({ isCompleted: !task!.isCompleted });

    expect(res.status).toBe(200);
    expect(res.body.isCompleted).toBe(!task!.isCompleted);
  });

  it("manager can reassign and completed task is reset", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    const source = await prisma.user.findUnique({
      where: { email: "emp@test.com" },
      select: { id: true, teamId: true },
    });
    const target = await prisma.user.findUnique({
      where: { email: "carol@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();
    expect(source?.teamId).toBe(manager?.teamId);
    expect(target?.teamId).toBe(manager?.teamId);

    const template = await prisma.taskTemplate.create({
      data: {
        title: `Reassign Reset ${Date.now()}`,
        createdById: manager!.id,
        assignedToEmployeeId: source!.id,
        isRecurring: false,
        notifyEmployee: false,
      },
    });

    try {
      const task = await prisma.dailyTask.create({
        data: {
          taskTemplateId: template.id,
          employeeId: source!.id,
          date: startOfToday(),
          isCompleted: true,
          completedAt: new Date(),
        },
      });

      const agent = request.agent(app);
      await login(agent, "mgr@test.com");
      const res = await agent
        .patch(`/api/tasks/daily/${task.id}`)
        .send({ employeeId: target!.id });

      expect(res.status).toBe(200);
      expect(res.body.employeeId).toBe(target!.id);
      expect(res.body.isCompleted).toBe(false);
      expect(res.body.completedAt).toBeNull();
    } finally {
      await prisma.taskTemplate.delete({ where: { id: template.id } });
    }
  });

  it("reassignment returns 409 when target already has same template/date", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    const source = await prisma.user.findUnique({
      where: { email: "emp@test.com" },
      select: { id: true, teamId: true },
    });
    const target = await prisma.user.findUnique({
      where: { email: "carol@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();
    expect(source?.teamId).toBe(manager?.teamId);
    expect(target?.teamId).toBe(manager?.teamId);

    const template = await prisma.taskTemplate.create({
      data: {
        title: `Reassign Conflict ${Date.now()}`,
        createdById: manager!.id,
        assignedToEmployeeId: source!.id,
        isRecurring: false,
        notifyEmployee: false,
      },
    });

    try {
      const date = startOfToday();
      const taskA = await prisma.dailyTask.create({
        data: {
          taskTemplateId: template.id,
          employeeId: source!.id,
          date,
        },
      });
      await prisma.dailyTask.create({
        data: {
          taskTemplateId: template.id,
          employeeId: target!.id,
          date,
        },
      });

      const agent = request.agent(app);
      await login(agent, "mgr@test.com");
      const res = await agent
        .patch(`/api/tasks/daily/${taskA.id}`)
        .send({ employeeId: target!.id });

      expect(res.status).toBe(409);
    } finally {
      await prisma.taskTemplate.delete({ where: { id: template.id } });
    }
  });

  it("PATCH /api/auth/profile updates name, email and password", async () => {
    const tempEmail = `profile-${Date.now()}@test.com`;
    const tempUser = await prisma.user.create({
      data: {
        name: "Profile User",
        email: tempEmail,
        passwordHash: await hashPassword("password"),
        role: "EMPLOYEE",
      },
    });

    try {
      const agent = request.agent(app);
      await login(agent, tempEmail);

      const nextEmail = `profile-next-${Date.now()}@test.com`;
      const res = await agent.patch("/api/auth/profile").send({
        name: "Updated Profile User",
        email: nextEmail,
        password: "nextPassword123",
      });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe("Updated Profile User");
      expect(res.body.user.email).toBe(nextEmail);

      const updated = await prisma.user.findUnique({
        where: { id: tempUser.id },
        select: { passwordHash: true },
      });
      expect(updated).not.toBeNull();
      const ok = await verifyPassword("nextPassword123", updated!.passwordHash);
      expect(ok).toBe(true);
    } finally {
      await prisma.user.delete({ where: { id: tempUser.id } }).catch(() => {});
    }
  });

  it("PATCH /api/auth/profile returns 409 on duplicate email", async () => {
    const tempEmail = `profile-dup-${Date.now()}@test.com`;
    const tempUser = await prisma.user.create({
      data: {
        name: "Profile Dup User",
        email: tempEmail,
        passwordHash: await hashPassword("password"),
        role: "EMPLOYEE",
      },
    });

    try {
      const agent = request.agent(app);
      await login(agent, tempEmail);

      const res = await agent.patch("/api/auth/profile").send({
        email: "emp@test.com",
      });

      expect(res.status).toBe(409);
    } finally {
      await prisma.user.delete({ where: { id: tempUser.id } }).catch(() => {});
    }
  });

  it("workstation employees endpoint updates assignments and allows empty list", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { id: true, teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const workstation = await prisma.workstation.create({
      data: { name: `WS-${Date.now()}`, teamId: manager!.teamId! },
    });
    const employee = await prisma.user.create({
      data: {
        name: "WS Employee",
        email: `ws-emp-${Date.now()}@test.com`,
        passwordHash: await hashPassword("password"),
        role: "EMPLOYEE",
        teamId: manager!.teamId!,
      },
    });

    try {
      const agent = request.agent(app);
      await login(agent, "mgr@test.com");

      const addRes = await agent
        .patch(`/api/workstations/${workstation.id}/employees`)
        .send({ employeeIds: [employee.id] });
      expect(addRes.status).toBe(200);
      expect(Array.isArray(addRes.body.employees)).toBe(true);
      expect(
        addRes.body.employees.some(
          (e: { employee: { id: string } }) => e.employee.id === employee.id,
        ),
      ).toBe(true);

      const clearRes = await agent
        .patch(`/api/workstations/${workstation.id}/employees`)
        .send({ employeeIds: [] });
      expect(clearRes.status).toBe(200);
      expect((clearRes.body.employees ?? []).length).toBe(0);
    } finally {
      await prisma.employeeWorkstation
        .deleteMany({ where: { workstationId: workstation.id } })
        .catch(() => {});
      await prisma.user.delete({ where: { id: employee.id } }).catch(() => {});
      await prisma.workstation
        .delete({ where: { id: workstation.id } })
        .catch(() => {});
    }
  });

  it("workstation employees endpoint rejects employee outside manager team", async () => {
    const manager = await prisma.user.findUnique({
      where: { email: "mgr@test.com" },
      select: { teamId: true },
    });
    expect(manager?.teamId).toBeTruthy();

    const workstation = await prisma.workstation.create({
      data: { name: `WS-forbidden-${Date.now()}`, teamId: manager!.teamId! },
    });

    const outsiderManager = await prisma.user.create({
      data: {
        name: "Outsider Manager",
        email: `outsider-mgr-${Date.now()}@test.com`,
        passwordHash: await hashPassword("password"),
        role: "MANAGER",
      },
    });
    const outsiderTeam = await prisma.team.create({
      data: {
        name: `Outsider Team ${Date.now()}`,
        managerId: outsiderManager.id,
      },
    });
    const outsiderEmployee = await prisma.user.create({
      data: {
        name: "Outsider Employee",
        email: `outsider-emp-${Date.now()}@test.com`,
        passwordHash: await hashPassword("password"),
        role: "EMPLOYEE",
        teamId: outsiderTeam.id,
      },
    });

    try {
      const agent = request.agent(app);
      await login(agent, "mgr@test.com");
      const res = await agent
        .patch(`/api/workstations/${workstation.id}/employees`)
        .send({ employeeIds: [outsiderEmployee.id] });

      expect(res.status).toBe(403);
    } finally {
      await prisma.employeeWorkstation
        .deleteMany({ where: { workstationId: workstation.id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { id: outsiderEmployee.id } })
        .catch(() => {});
      await prisma.team
        .delete({ where: { id: outsiderTeam.id } })
        .catch(() => {});
      await prisma.user
        .delete({ where: { id: outsiderManager.id } })
        .catch(() => {});
      await prisma.workstation
        .delete({ where: { id: workstation.id } })
        .catch(() => {});
    }
  });
});
