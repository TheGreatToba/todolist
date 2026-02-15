/**
 * One-off backfill (best-effort): set teamId on workstations that have none (legacy).
 * Run once after adding Workstation.teamId. Ambiguous cases use "first employee" or "first team".
 *
 * Logic:
 * - With employees: teamId = first employee's teamId.
 * - Without employees: teamId = first team in DB (so they appear in a list).
 * - Not assignable: no employees and no team in DB → left teamId=null.
 *
 * Usage:
 *   pnpm backfill:workstation-team           # apply updates
 *   pnpm backfill:workstation-team --dry-run # log what would be done, no writes
 */
import 'dotenv/config';
import prisma from '../lib/db';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (dryRun) {
    console.log(' dry-run: no changes will be written.\n');
  }

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

  const idsByCategory = {
    withEmployees: [] as string[],
    withoutEmployees: [] as string[],
    notAssignable: [] as string[],
  };
  let updated = 0;

  for (const ws of legacy) {
    const teamId =
      ws.employees.length > 0
        ? ws.employees[0].employee.teamId
        : firstTeam?.id ?? null;

    if (ws.employees.length > 0) idsByCategory.withEmployees.push(ws.id);
    else if (firstTeam) idsByCategory.withoutEmployees.push(ws.id);
    else idsByCategory.notAssignable.push(ws.id);

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
          : `Workstation "${ws.name}" (${ws.id}) -> teamId=${teamId}`
      );
    } else {
      console.log(
        `Workstation "${ws.name}" (${ws.id}) has no employees and no team; left teamId=null.`
      );
    }
  }

  console.log(
    `\nBackfill ${dryRun ? '(dry-run) ' : ''}done: ${updated}/${legacy.length} workstations ${dryRun ? 'would be updated' : 'updated'}.`
  );
  console.log('Summary (legacy workstations):');
  const fmt = (ids: string[]) => `${ids.length} — ids: ${ids.join(', ')}`;
  console.log(`  - With employees (assigned from first employee’s team): ${fmt(idsByCategory.withEmployees)}`);
  console.log(`  - Without employees (assigned to first team): ${fmt(idsByCategory.withoutEmployees)}`);
  console.log(`  - Not assignable (left teamId=null): ${fmt(idsByCategory.notAssignable)}`);
  if (dryRun && updated > 0) {
    console.log('\nRun without --dry-run to apply changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
