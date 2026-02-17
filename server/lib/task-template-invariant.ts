import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { AppError } from './errors';

export const TASK_TEMPLATE_SAME_TEAM_MESSAGE =
  'Workstation and employee must belong to the same team';

export const TASK_TEMPLATE_BULK_UPDATE_FORBIDDEN_MESSAGE =
  'Bulk updates to workstationId/assignedToEmployeeId are not allowed; update templates individually';

type FieldInput = string | null | { set: string | null } | undefined;

function extractScalar(value: FieldInput): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string') return value;
  if (typeof value === 'object' && 'set' in value) {
    const setVal = (value as { set: string | null }).set;
    return setVal ?? null;
  }
  return undefined;
}

function resolveWorkstationAndEmployeeIds(
  prisma: PrismaClient,
  action: string,
  args: Record<string, unknown>
): Promise<{ workstationId: string | null; assignedToEmployeeId: string | null }> {
  if (action === 'create') {
    const data = args.data as Record<string, unknown>;
    const ws = extractScalar((data as any).workstationId as FieldInput);
    const emp = extractScalar((data as any).assignedToEmployeeId as FieldInput);
    return Promise.resolve({
      workstationId: ws ?? null,
      assignedToEmployeeId: emp ?? null,
    });
  }

  if (action === 'update') {
    const data = args.data as Record<string, unknown>;
    const where = args.where as Prisma.TaskTemplateWhereUniqueInput;
    return prisma.taskTemplate
      .findFirst({
        where,
        select: { workstationId: true, assignedToEmployeeId: true },
      })
      .then((existing) => {
        if (!existing) return { workstationId: null, assignedToEmployeeId: null };
        const wsUpdate = extractScalar((data as any).workstationId as FieldInput);
        const empUpdate = extractScalar((data as any).assignedToEmployeeId as FieldInput);
        return {
          workstationId: wsUpdate !== undefined ? wsUpdate : existing.workstationId,
          assignedToEmployeeId:
            empUpdate !== undefined ? empUpdate : existing.assignedToEmployeeId,
        };
      });
  }

  // upsert: where + create + update
  const create = args.create as Record<string, unknown>;
  const update = args.update as Record<string, unknown>;
  const where = args.where as Prisma.TaskTemplateWhereUniqueInput;
  return prisma.taskTemplate
    .findFirst({
      where,
      select: { workstationId: true, assignedToEmployeeId: true },
    })
    .then((existing) => {
      if (existing) {
        const wsUpdate = extractScalar((update as any).workstationId as FieldInput);
        const empUpdate = extractScalar(
          (update as any).assignedToEmployeeId as FieldInput
        );
        return {
          workstationId: wsUpdate !== undefined ? wsUpdate : existing.workstationId,
          assignedToEmployeeId:
            empUpdate !== undefined ? empUpdate : existing.assignedToEmployeeId,
        };
      }
      const wsCreate = extractScalar((create as any).workstationId as FieldInput);
      const empCreate = extractScalar(
        (create as any).assignedToEmployeeId as FieldInput
      );
      return {
        workstationId: wsCreate ?? null,
        assignedToEmployeeId: empCreate ?? null,
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

    // Disallow bulk updates that touch these linkage fields, to avoid
    // silently breaking the invariant on many rows at once.
    if (params.action === 'updateMany') {
      const data = (params.args as any).data as Record<string, unknown> | undefined;
      if (data) {
        const ws = extractScalar((data as any).workstationId as FieldInput);
        const emp = extractScalar((data as any).assignedToEmployeeId as FieldInput);
        if (ws !== undefined || emp !== undefined) {
          throw new AppError(400, TASK_TEMPLATE_BULK_UPDATE_FORBIDDEN_MESSAGE);
        }
      }
      return next(params);
    }

    const supported = ['create', 'update', 'upsert'];
    if (!supported.includes(params.action)) return next(params);

    const { workstationId, assignedToEmployeeId } =
      await resolveWorkstationAndEmployeeIds(
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
