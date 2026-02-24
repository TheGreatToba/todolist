/**
 * Backfill immutable DailyTask template snapshots for legacy rows.
 *
 * Usage:
 *   pnpm backfill:dailytask-snapshots
 *   pnpm backfill:dailytask-snapshots --dry-run
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import prisma from "../lib/db";

type CountRow = {
  count: bigint | number | string;
};

function toNumber(value: bigint | number | string): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return value;
}

export interface DailyTaskSnapshotBackfillResult {
  candidates: number;
  updated: number;
  dryRun: boolean;
}

async function countBackfillCandidates(): Promise<number> {
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS "count"
    FROM "DailyTask" dt
    JOIN "TaskTemplate" tt
      ON dt."taskTemplateId" = tt."id"
    WHERE
      NULLIF(BTRIM(dt."templateSourceId"), '') IS NULL
      OR NULLIF(BTRIM(dt."templateTitle"), '') IS NULL
      OR dt."templateRecurrenceType" IS NULL
  `;
  return rows.length > 0 ? toNumber(rows[0].count) : 0;
}

export async function runDailyTaskSnapshotBackfill(
  dryRun = false,
): Promise<DailyTaskSnapshotBackfillResult> {
  const candidates = await countBackfillCandidates();
  if (candidates === 0) {
    console.log("No DailyTask snapshot backfill needed.");
    return { candidates: 0, updated: 0, dryRun };
  }

  if (dryRun) {
    console.log(
      `[dry-run] ${candidates} DailyTask row(s) would be backfilled with immutable template snapshots.`,
    );
    return { candidates, updated: 0, dryRun };
  }

  const updated = await prisma.$executeRaw`
    UPDATE "DailyTask" AS dt
    SET
      "templateSourceId" = tt."id",
      "templateTitle" = tt."title",
      "templateDescription" = tt."description",
      "templateRecurrenceType" = tt."recurrenceType",
      "templateIsRecurring" = tt."isRecurring",
      "templateWorkstationId" = ws."id",
      "templateWorkstationName" = ws."name"
    FROM "TaskTemplate" AS tt
    LEFT JOIN "Workstation" AS ws
      ON ws."id" = tt."workstationId"
    WHERE
      dt."taskTemplateId" = tt."id"
      AND (
        NULLIF(BTRIM(dt."templateSourceId"), '') IS NULL
        OR NULLIF(BTRIM(dt."templateTitle"), '') IS NULL
        OR dt."templateRecurrenceType" IS NULL
      )
  `;

  console.log(`Backfilled ${updated} DailyTask row(s).`);
  return { candidates, updated, dryRun };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  await runDailyTaskSnapshotBackfill(dryRun);
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
