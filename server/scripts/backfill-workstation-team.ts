/**
 * One-off backfill (best-effort): set teamId on workstations that have none (legacy).
 * Run once after adding Workstation.teamId. Ambiguous cases use "first employee" or "first team".
 *
 * Logic (deterministic order: workstations by name/id, employees by employeeId, first team by id):
 * - With employees: teamId = first employee (in order) that has teamId; if none, left teamId=null.
 * - Without employees: teamId = first team in DB, or null if no team.
 * - Categories: withEmployees, employeesButNoTeam, withoutEmployees, notAssignable.
 *
 * Usage:
 *   pnpm backfill:workstation-team           # apply updates
 *   pnpm backfill:workstation-team --dry-run # log what would be done, no writes
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import prisma from "../lib/db";

export interface BackfillResult {
  idsByCategory: {
    withEmployees: string[];
    employeesButNoTeam: string[];
    withoutEmployees: string[];
    notAssignable: string[];
  };
  updated: number;
  legacyCount: number;
}

export async function runBackfill(
  dryRun: boolean,
): Promise<BackfillResult | null> {
  const legacy = await prisma.workstation.findMany({
    where: { teamId: null },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    include: {
      employees: {
        orderBy: { employeeId: "asc" },
        include: {
          employee: { select: { teamId: true } },
        },
      },
    },
  });

  if (legacy.length === 0) {
    return null;
  }

  const firstTeam = await prisma.team.findFirst({
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!firstTeam) {
    console.warn(
      "No team in DB; cannot assign workstations with no employees.",
    );
  }

  const idsByCategory = {
    withEmployees: [] as string[],
    employeesButNoTeam: [] as string[],
    withoutEmployees: [] as string[],
    notAssignable: [] as string[],
  };
  let updated = 0;

  for (const ws of legacy) {
    let teamId: string | null;
    if (ws.employees.length > 0) {
      const firstWithTeam = ws.employees.find(
        (ew) => ew.employee.teamId != null,
      );
      teamId = firstWithTeam?.employee.teamId ?? null;
      if (teamId) idsByCategory.withEmployees.push(ws.id);
      else idsByCategory.employeesButNoTeam.push(ws.id);
    } else {
      teamId = firstTeam?.id ?? null;
      if (firstTeam) idsByCategory.withoutEmployees.push(ws.id);
      else idsByCategory.notAssignable.push(ws.id);
    }

    if (teamId) {
      if (!dryRun) {
        await prisma.workstation.update({
          where: { id: ws.id },
          data: { teamId },
        });
      }
      updated++;
      console.log(
        dryRun
          ? `[dry-run] Would set Workstation "${ws.name}" (${ws.id}) -> teamId=${teamId}`
          : `Workstation "${ws.name}" (${ws.id}) -> teamId=${teamId}`,
      );
    } else {
      const reason =
        ws.employees.length > 0
          ? "employees have no team; left teamId=null"
          : "no employees and no team; left teamId=null";
      console.log(`Workstation "${ws.name}" (${ws.id}) ${reason}.`);
    }
  }

  console.log(
    `\nBackfill ${dryRun ? "(dry-run) " : ""}done: ${updated}/${legacy.length} workstations ${dryRun ? "would be updated" : "updated"}.`,
  );
  console.log("Summary (legacy workstations):");
  const fmt = (ids: string[]) => `${ids.length} — ids: ${ids.join(", ")}`;
  console.log(
    `  - With employees (assigned from first employee’s team): ${fmt(idsByCategory.withEmployees)}`,
  );
  console.log(
    `  - With employees but no employee has team (left teamId=null): ${fmt(idsByCategory.employeesButNoTeam)}`,
  );
  console.log(
    `  - Without employees (assigned to first team): ${fmt(idsByCategory.withoutEmployees)}`,
  );
  console.log(
    `  - Not assignable (no employees, no team): ${fmt(idsByCategory.notAssignable)}`,
  );
  if (dryRun && updated > 0) {
    console.log("\nRun without --dry-run to apply changes.");
  }

  return { idsByCategory, updated, legacyCount: legacy.length };
}

const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (dryRun) {
    console.log(" dry-run: no changes will be written.\n");
  }
  const result = await runBackfill(dryRun);
  if (result === null) {
    console.log("No workstations with teamId=null. Nothing to do.");
  }
  await prisma.$disconnect();
}

function isDirectEntrypoint() {
  const scriptPath = process.argv[1];
  if (!scriptPath) return false;
  return import.meta.url === pathToFileURL(scriptPath).href;
}

if (isDirectEntrypoint()) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
