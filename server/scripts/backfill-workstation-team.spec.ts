/**
 * Backfill script tests: category employeesButNoTeam and deterministic behaviour.
 * Prerequisites: DATABASE_URL (and JWT_SECRET for app). Run after seed or on empty DB.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "../lib/db";
import type { runBackfill as RunBackfill } from "./backfill-workstation-team";

describe("runBackfill", () => {
  let wsNoTeamId: string;
  let userNoTeamId: string;
  let runBackfill: typeof RunBackfill;

  it("does not auto-run main or call process.exit when imported", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit should not be called on import");
    }) as never);

    const module = await import("./backfill-workstation-team");
    runBackfill = module.runBackfill;

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  beforeAll(async () => {
    if (!runBackfill) {
      const module = await import("./backfill-workstation-team");
      runBackfill = module.runBackfill;
    }

    const user = await prisma.user.create({
      data: {
        name: "Orphan Employee",
        email: `orphan-${Date.now()}@test.com`,
        passwordHash: "hash",
        role: "EMPLOYEE",
        teamId: null,
      },
    });
    userNoTeamId = user.id;

    const ws = await prisma.workstation.create({
      data: {
        name: "Orphan Workstation",
        teamId: null,
        employees: {
          create: [{ employeeId: user.id }],
        },
      },
    });
    wsNoTeamId = ws.id;
  });

  afterAll(async () => {
    await prisma.employeeWorkstation.deleteMany({
      where: { workstationId: wsNoTeamId },
    });
    await prisma.workstation.deleteMany({ where: { id: wsNoTeamId } });
    await prisma.user.deleteMany({ where: { id: userNoTeamId } });
  });

  it("classifies workstation with employees but all employee teamId null as employeesButNoTeam", async () => {
    const result = await runBackfill(true);
    expect(result).not.toBeNull();
    expect(result!.idsByCategory.employeesButNoTeam).toContain(wsNoTeamId);
    expect(result!.idsByCategory.withEmployees).not.toContain(wsNoTeamId);
  });
});
