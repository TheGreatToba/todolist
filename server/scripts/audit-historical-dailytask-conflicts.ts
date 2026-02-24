/**
 * Audit historical DailyTask conflicts for the fallback uniqueness scope:
 * taskTemplateId IS NULL + templateSourceId + employeeId + date.
 *
 * Usage:
 *   pnpm audit:historical-task-conflicts
 *   pnpm audit:historical-task-conflicts --limit=500
 *   pnpm audit:historical-task-conflicts --allow-conflicts
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import prisma from "../lib/db";

type RawConflictRow = {
  templateSourceId: string;
  employeeId: string;
  date: Date | string;
  count: number | bigint | string;
};

export interface HistoricalTaskConflict {
  templateSourceId: string;
  employeeId: string;
  date: Date;
  count: number;
}

export async function findHistoricalTaskConflicts(
  limit = 200,
): Promise<HistoricalTaskConflict[]> {
  const rows = await prisma.$queryRaw<RawConflictRow[]>`
    SELECT
      "templateSourceId" AS "templateSourceId",
      "employeeId" AS "employeeId",
      "date" AS "date",
      COUNT(*) AS "count"
    FROM "DailyTask"
    WHERE
      "taskTemplateId" IS NULL
      AND "templateSourceId" <> ''
      AND "employeeId" IS NOT NULL
    GROUP BY "templateSourceId", "employeeId", "date"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, "date" DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    templateSourceId: row.templateSourceId,
    employeeId: row.employeeId,
    date: row.date instanceof Date ? row.date : new Date(row.date),
    count:
      typeof row.count === "bigint"
        ? Number(row.count)
        : typeof row.count === "string"
          ? Number(row.count)
          : row.count,
  }));
}

export async function runHistoricalTaskConflictAudit(options?: {
  limit?: number;
}): Promise<{
  conflicts: HistoricalTaskConflict[];
}> {
  const limit = options?.limit ?? 200;
  const conflicts = await findHistoricalTaskConflicts(limit);

  if (conflicts.length === 0) {
    console.log(
      "No historical DailyTask conflicts found for scope (templateSourceId, employeeId, date) when taskTemplateId IS NULL.",
    );
    return { conflicts };
  }

  console.error(
    `Found ${conflicts.length} conflicting group(s). Resolve these before applying the partial unique index migration.`,
  );
  for (const item of conflicts) {
    console.error(
      `- templateSourceId=${item.templateSourceId}, employeeId=${item.employeeId}, date=${item.date.toISOString()}, count=${item.count}`,
    );
  }

  return { conflicts };
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit = limitArg ? Number(limitArg.split("=")[1]) : 200;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200;
  const allowConflicts = process.argv.includes("--allow-conflicts");

  const { conflicts } = await runHistoricalTaskConflictAudit({ limit });
  await prisma.$disconnect();

  if (conflicts.length > 0 && !allowConflicts) {
    process.exit(1);
  }
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
