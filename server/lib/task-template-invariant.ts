import type { PrismaClient } from "@prisma/client";
import { AppError } from "./errors";

export const TASK_TEMPLATE_SAME_TEAM_MESSAGE =
  "Workstation and employee must belong to the same team";

export const TASK_TEMPLATE_BULK_UPDATE_FORBIDDEN_MESSAGE =
  "Bulk updates to workstationId/assignedToEmployeeId are not allowed; update templates individually";

function extractScalar(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string") {
    return value as string | null;
  }
  if (typeof value === "object" && value !== null && "set" in (value as any)) {
    const setVal = (value as { set: unknown }).set;
    if (setVal === null || typeof setVal === "string") {
      return setVal as string | null;
    }
    // Unexpected type for .set -> surface a 400 instead of silently ignoring it
    throw new AppError(400, "Invalid TaskTemplate linkage payload");
  }
  return undefined;
}

function resolveWorkstationAndEmployeeIds(
  prisma: PrismaClient,
  action: string,
  args: Record<string, unknown>,
): Promise<{
  workstationId: string | null;
  assignedToEmployeeId: string | null;
}> {
  if (action === "create") {
    const data = args.data as Record<string, unknown>;
    const ws = extractScalar((data as any).workstationId);
    const emp = extractScalar((data as any).assignedToEmployeeId);
    return Promise.resolve({
      workstationId: ws ?? null,
      assignedToEmployeeId: emp ?? null,
    });
  }

  if (action === "update") {
    const data = args.data as Record<string, unknown>;
    const where = args.where as { id?: string };
    return prisma.taskTemplate
      .findFirst({
        where,
        select: { workstationId: true, assignedToEmployeeId: true },
      })
      .then((existing) => {
        if (!existing)
          return { workstationId: null, assignedToEmployeeId: null };
        const wsUpdate = extractScalar((data as any).workstationId);
        const empUpdate = extractScalar((data as any).assignedToEmployeeId);
        return {
          workstationId:
            wsUpdate !== undefined ? wsUpdate : existing.workstationId,
          assignedToEmployeeId:
            empUpdate !== undefined ? empUpdate : existing.assignedToEmployeeId,
        };
      });
  }

  // upsert: where + create + update
  const create = args.create as Record<string, unknown>;
  const update = args.update as Record<string, unknown>;
  const where = args.where as { id?: string };
  return prisma.taskTemplate
    .findFirst({
      where,
      select: { workstationId: true, assignedToEmployeeId: true },
    })
    .then((existing) => {
      if (existing) {
        const wsUpdate = extractScalar((update as any).workstationId);
        const empUpdate = extractScalar((update as any).assignedToEmployeeId);
        return {
          workstationId:
            wsUpdate !== undefined ? wsUpdate : existing.workstationId,
          assignedToEmployeeId:
            empUpdate !== undefined ? empUpdate : existing.assignedToEmployeeId,
        };
      }
      const wsCreate = extractScalar((create as any).workstationId);
      const empCreate = extractScalar((create as any).assignedToEmployeeId);
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
  prisma: PrismaClient,
): void {
  prisma.$use(async (params, next) => {
    if (params.model !== "TaskTemplate") return next(params);

    // Disallow bulk updates that touch these linkage fields, to avoid
    // silently breaking the invariant on many rows at once.
    if (params.action === "updateMany") {
      const data = (params.args as any).data as
        | Record<string, unknown>
        | undefined;
      if (data) {
        const ws = extractScalar((data as any).workstationId);
        const emp = extractScalar((data as any).assignedToEmployeeId);
        if (ws !== undefined || emp !== undefined) {
          throw new AppError(400, TASK_TEMPLATE_BULK_UPDATE_FORBIDDEN_MESSAGE);
        }
      }
      return next(params);
    }

    const supported = ["create", "update", "upsert"];
    if (!supported.includes(params.action)) return next(params);

    const { workstationId, assignedToEmployeeId } =
      await resolveWorkstationAndEmployeeIds(
        prisma,
        params.action,
        params.args as Record<string, unknown>,
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
    if (
      !workstation?.teamId ||
      !user?.teamId ||
      workstation.teamId !== user.teamId
    ) {
      throw new AppError(400, TASK_TEMPLATE_SAME_TEAM_MESSAGE);
    }
    return next(params);
  });
}
