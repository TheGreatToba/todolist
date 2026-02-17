import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { AppError } from './errors';

export const TASK_TEMPLATE_SAME_TEAM_MESSAGE =
  'Workstation and employee must belong to the same team';

type DataShape = { workstationId?: string | null; assignedToEmployeeId?: string | null };

function resolveWorkstationAndEmployeeIds(
  prisma: PrismaClient,
  action: string,
  args: Record<string, unknown>
): Promise<{ workstationId: string | null; assignedToEmployeeId: string | null }> {
  if (action === 'create') {
    const data = args.data as DataShape;
    return Promise.resolve({
      workstationId: data.workstationId ?? null,
      assignedToEmployeeId: data.assignedToEmployeeId ?? null,
    });
  }
  if (action === 'updateMany') {
    const data = args.data as DataShape;
    return Promise.resolve({
      workstationId: data.workstationId ?? null,
      assignedToEmployeeId: data.assignedToEmployeeId ?? null,
    });
  }
  if (action === 'update') {
    const data = args.data as DataShape;
    const where = args.where as Prisma.TaskTemplateWhereUniqueInput;
    return prisma.taskTemplate.findFirst({ where, select: { workstationId: true, assignedToEmployeeId: true } }).then((existing) => {
      if (!existing) return { workstationId: null, assignedToEmployeeId: null };
      return {
        workstationId: data.workstationId !== undefined ? data.workstationId : existing.workstationId,
        assignedToEmployeeId: data.assignedToEmployeeId !== undefined ? data.assignedToEmployeeId : existing.assignedToEmployeeId,
      };
    });
  }
  // upsert: where + create + update
  const create = args.create as DataShape;
  const update = args.update as DataShape;
  const where = args.where as Prisma.TaskTemplateWhereUniqueInput;
  return prisma.taskTemplate.findFirst({ where, select: { workstationId: true, assignedToEmployeeId: true } }).then((existing) => {
    if (existing) {
      return {
        workstationId: update.workstationId !== undefined ? update.workstationId : existing.workstationId,
        assignedToEmployeeId: update.assignedToEmployeeId !== undefined ? update.assignedToEmployeeId : existing.assignedToEmployeeId,
      };
    }
    return {
      workstationId: create.workstationId ?? null,
      assignedToEmployeeId: create.assignedToEmployeeId ?? null,
    };
  });
}

/**
 * Enforces the business invariant: when a TaskTemplate has both workstationId
 * and assignedToEmployeeId, they must belong to the same team. Prisma/SQLite
 * do not enforce this; this middleware ensures no other code path can create,
 * update, upsert or updateMany a template with a cross-team assignment.
 * Throws AppError(400) so handlers return a proper 400 instead of 500.
 */
export function applyTaskTemplateInvariantMiddleware(
  prisma: PrismaClient
): void {
  prisma.$use(async (params, next) => {
    if (params.model !== 'TaskTemplate') return next(params);
    const supported = ['create', 'update', 'upsert', 'updateMany'];
    if (!supported.includes(params.action)) return next(params);

    const { workstationId, assignedToEmployeeId } = await resolveWorkstationAndEmployeeIds(
      prisma,
      params.action,
      params.args as Record<string, unknown>
    );

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
      throw new AppError(400, TASK_TEMPLATE_SAME_TEAM_MESSAGE);
    }
    return next(params);
  });
}
