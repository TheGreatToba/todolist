/**
 * One-off backfill (best-effort): set teamId on workstations that have none (legacy).
 * Run once after adding Workstation.teamId. Ambiguous cases use "first employee" or "first team".
 *
 * Logic:
 * - With employees: teamId = first employee's teamId.
 * - Without employees: teamId = first team in DB (so they appear in a list).
 * - Not assignable: no employees and no team in DB → left teamId=null.
 *
 * Usage: pnpm backfill:workstation-team
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

  const byCategory = { withEmployees: 0, withoutEmployees: 0, notAssignable: 0 };
  let updated = 0;

  for (const ws of legacy) {
    const teamId =
      ws.employees.length > 0
        ? ws.employees[0].employee.teamId
        : firstTeam?.id ?? null;

    if (ws.employees.length > 0) byCategory.withEmployees++;
    else if (firstTeam) byCategory.withoutEmployees++;
    else byCategory.notAssignable++;

    if (teamId) {
      await prisma.workstation.update({
        where: { id: ws.id },
        data: { teamId },
      });
      updated++;
      console.log(`Workstation "${ws.name}" (${ws.id}) -> teamId=${teamId}`);
    } else {
      console.log(
        `Workstation "${ws.name}" (${ws.id}) has no employees and no team; left teamId=null.`
      );
    }
  }

  console.log(`\nBackfill done: ${updated}/${legacy.length} workstations updated.`);
  console.log('Summary (legacy workstations):');
  console.log(`  - With employees (assigned from first employee’s team): ${byCategory.withEmployees}`);
  console.log(`  - Without employees (assigned to first team): ${byCategory.withoutEmployees}`);
  console.log(`  - Not assignable (left teamId=null): ${byCategory.notAssignable}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
