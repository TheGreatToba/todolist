import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

const TASK_TEMPLATE_SAME_TEAM_ERROR =
  'Workstation and employee must belong to the same team';

/**
 * Enforces the business invariant: when a TaskTemplate has both workstationId
 * and assignedToEmployeeId, they must belong to the same team. Prisma/SQLite
 * do not enforce this; this middleware ensures no other code path can create
 * or update a template with a cross-team assignment.
 */
export function applyTaskTemplateInvariantMiddleware(
  prisma: PrismaClient
): void {
  prisma.$use(async (params, next) => {
    if (params.model !== 'TaskTemplate') return next(params);
    if (params.action !== 'create' && params.action !== 'update') return next(params);

    type Data = { workstationId?: string | null; assignedToEmployeeId?: string | null };
    let workstationId: string | null = null;
    let assignedToEmployeeId: string | null = null;

    if (params.action === 'create') {
      const data = params.args.data as Data;
      workstationId = data.workstationId ?? null;
      assignedToEmployeeId = data.assignedToEmployeeId ?? null;
    } else {
      const data = params.args.data as Data;
      const existing = await prisma.taskTemplate.findUnique({
        where: params.args.where as { id: string },
        select: { workstationId: true, assignedToEmployeeId: true },
      });
      if (!existing) return next(params);
      workstationId =
        data.workstationId !== undefined ? data.workstationId : existing.workstationId;
      assignedToEmployeeId =
        data.assignedToEmployeeId !== undefined
          ? data.assignedToEmployeeId
          : existing.assignedToEmployeeId;
    }

    if (!workstationId || !assignedToEmployeeId) return next(params);

    const [workstation, user] = await Promise.all([
      prisma.workstation.findUnique({
        where: { id: workstationId },
        select: { teamId: true },
      }),
      prisma.user.findUnique({
        where: { id: assignedToEmployeeId },
        select: { teamId: true },
      }),
    ]);
    if (!workstation?.teamId || !user?.teamId || workstation.teamId !== user.teamId) {
      throw new Error(TASK_TEMPLATE_SAME_TEAM_ERROR);
    }
    return next(params);
  });
}
