/**
 * One-off backfill: set teamId on workstations that have none (legacy).
 * Run once after adding Workstation.teamId, then remove fallback teamId === null in routes.
 *
 * Logic:
 * - Workstations with employees: set teamId to the first employee's teamId.
 * - Workstations with no employees: set teamId to the first team in the DB (so they appear in a list).
 *
 * Usage: pnpm exec tsx server/scripts/backfill-workstation-team.ts
 */
import 'dotenv/config';
import prisma from '../lib/db';

async function main() {
  const legacy = await prisma.workstation.findMany({
    where: { teamId: null },
    include: {
      employees: {
        include: {
          employee: { select: { teamId: true } },
        },
      },
    },
  });

  if (legacy.length === 0) {
    console.log('No workstations with teamId=null. Nothing to do.');
    return;
  }

  const firstTeam = await prisma.team.findFirst({ select: { id: true } });
  if (!firstTeam) {
    console.warn('No team in DB; cannot assign workstations with no employees.');
  }

  let updated = 0;
  for (const ws of legacy) {
    const teamId =
      ws.employees.length > 0
        ? ws.employees[0].employee.teamId
        : firstTeam?.id ?? null;

    if (teamId) {
      await prisma.workstation.update({
        where: { id: ws.id },
        data: { teamId },
      });
      updated++;
      console.log(`Workstation "${ws.name}" (${ws.id}) -> teamId=${teamId}`);
    } else {
      console.log(`Workstation "${ws.name}" (${ws.id}) has no employees and no team; left teamId=null.`);
    }
  }

  console.log(`Backfill done: ${updated}/${legacy.length} workstations updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
