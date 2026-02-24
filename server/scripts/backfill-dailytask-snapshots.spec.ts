import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import prisma from "../lib/db";
import type { runDailyTaskSnapshotBackfill as RunBackfill } from "./backfill-dailytask-snapshots";

describe("runDailyTaskSnapshotBackfill", () => {
  let runDailyTaskSnapshotBackfill: typeof RunBackfill;
  let managerId: string;
  let teamId: string;
  let workstationId: string;
  let templateId: string;
  let dailyTaskId: string;

  it("does not auto-run main or call process.exit when imported", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called on import");
    }) as never);

    const module = await import("./backfill-dailytask-snapshots");
    runDailyTaskSnapshotBackfill = module.runDailyTaskSnapshotBackfill;

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  beforeAll(async () => {
    if (!runDailyTaskSnapshotBackfill) {
      const module = await import("./backfill-dailytask-snapshots");
      runDailyTaskSnapshotBackfill = module.runDailyTaskSnapshotBackfill;
    }

    const manager = await prisma.user.create({
      data: {
        name: "Snapshot Backfill Manager",
        email: `snapshot-backfill-${Date.now()}@test.com`,
        passwordHash: "hash",
        role: "MANAGER",
      },
    });
    managerId = manager.id;

    const team = await prisma.team.create({
      data: {
        name: `Snapshot Team ${Date.now()}`,
        managerId,
      },
    });
    teamId = team.id;

    await prisma.user.update({
      where: { id: managerId },
      data: { teamId },
    });

    const workstation = await prisma.workstation.create({
      data: {
        name: `Snapshot WS ${Date.now()}`,
        teamId,
      },
    });
    workstationId = workstation.id;

    const template = await prisma.taskTemplate.create({
      data: {
        title: `Snapshot Template ${Date.now()}`,
        description: "Legacy row without snapshots",
        workstationId,
        createdById: managerId,
        isRecurring: false,
        recurrenceType: "weekly",
      },
    });
    templateId = template.id;

    const task = await prisma.dailyTask.create({
      data: {
        taskTemplateId: templateId,
        templateSourceId: "",
        templateTitle: "",
        templateDescription: null,
        templateRecurrenceType: null,
        templateIsRecurring: true,
        templateWorkstationId: null,
        templateWorkstationName: null,
        employeeId: null,
        date: new Date(),
        status: "UNASSIGNED",
        isCompleted: false,
      },
    });
    dailyTaskId = task.id;
  });

  afterAll(async () => {
    await prisma.dailyTask.deleteMany({ where: { id: dailyTaskId } });
    await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
    await prisma.workstation.deleteMany({ where: { id: workstationId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.user.deleteMany({ where: { id: managerId } });
  });

  it("backfills missing snapshot fields from TaskTemplate and Workstation", async () => {
    const dryRun = await runDailyTaskSnapshotBackfill(true);
    expect(dryRun.candidates).toBeGreaterThan(0);
    expect(dryRun.updated).toBe(0);

    const result = await runDailyTaskSnapshotBackfill(false);
    expect(result.updated).toBeGreaterThan(0);

    const updated = await prisma.dailyTask.findUnique({
      where: { id: dailyTaskId },
      select: {
        templateSourceId: true,
        templateTitle: true,
        templateDescription: true,
        templateRecurrenceType: true,
        templateIsRecurring: true,
        templateWorkstationId: true,
        templateWorkstationName: true,
      },
    });

    expect(updated?.templateSourceId).toBe(templateId);
    expect(updated?.templateTitle).toContain("Snapshot Template");
    expect(updated?.templateDescription).toBe("Legacy row without snapshots");
    expect(updated?.templateRecurrenceType).toBe("weekly");
    expect(updated?.templateIsRecurring).toBe(false);
    expect(updated?.templateWorkstationId).toBe(workstationId);
    expect(updated?.templateWorkstationName).toContain("Snapshot WS");
  });
});
