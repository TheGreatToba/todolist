import { RequestHandler } from "express";
import { z } from "zod";
import { getIO } from "../lib/socket";
import { sendErrorResponse } from "../lib/errors";
import { getAuthOrThrow } from "../middleware/requireAuth";
import { getTenantOrThrow } from "../middleware/requireTenantContext";
import { assignDailyTasksForDate } from "../jobs/daily-task-assignment";
import type {
  ManagerWeeklyReport,
  ManagerWeeklyReportEmployeeBottleneck,
  ManagerWeeklyReportSummary,
  ManagerWeeklyReportWorkstationBottleneck,
  ManagerWeeklyReportRecurringDelay,
} from "@shared/api";
import { logger } from "../lib/logger";
import { computeTaskPriorityScore } from "../lib/priority-score";
import { paramString } from "../lib/params";
import { sendTaskAssignmentEmail } from "../lib/email";
import { parseDateQuery } from "../lib/parse-date-query";
import {
  parseDateQueryParam,
  parseManagerDashboardQuery,
} from "../lib/query-schemas";
import {
  normalizeRecurrenceMode,
  parseRecurrenceDaysCsv,
  shouldTemplateAppearOnDate,
} from "../lib/recurrence";
import {
  createTaskTemplateTransactional,
  instantiateManualTriggerTemplateTaskTransactional,
} from "../services/task-template.service";
import { scopedPrisma } from "../security/scoped-prisma";
import {
  assertEmployeeOwnsTask,
  assertManagerOwnsTeam,
  assertTenantAccessToResource,
} from "../security/tenantGuard";
import type { TenantContext } from "../security/tenant-context";

const RecurrenceModeSchema = z.enum([
  "schedule_based",
  "after_completion",
  "manual_trigger",
]);
const ScheduleRecurrenceTypeSchema = z.enum([
  "daily",
  "weekly",
  "x_per_week",
  "monthly",
]);
const RecurrenceIntervalUnitSchema = z.enum(["day", "week", "month"]);

const UpdateTaskTemplateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  workstationId: z.string().optional().nullable(),
  assignedToEmployeeId: z.string().optional().nullable(),
  isRecurring: z.boolean().optional(),
  recurrenceMode: RecurrenceModeSchema.optional(),
  recurrenceType: ScheduleRecurrenceTypeSchema.optional(),
  recurrenceDays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  recurrenceDayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  recurrenceInterval: z.number().int().min(1).optional().nullable(),
  recurrenceIntervalUnit: RecurrenceIntervalUnitSchema.optional().nullable(),
  targetPerWeek: z.number().int().min(1).max(7).optional().nullable(),
  notifyEmployee: z.boolean().optional(),
});

const AssignTaskFromTemplateSchema = z
  .object({
    templateId: z.string().min(1),
    assignmentType: z.enum(["workstation", "employee"]),
    workstationId: z.string().optional(),
    assignedToEmployeeId: z.string().optional(),
    notifyEmployee: z.boolean().optional(),
    date: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.assignmentType === "workstation" && !data.workstationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "workstationId is required when assignmentType is workstation",
        path: ["workstationId"],
      });
    }
    if (data.assignmentType === "employee" && !data.assignedToEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "assignedToEmployeeId is required when assignmentType is employee",
        path: ["assignedToEmployeeId"],
      });
    }
  });

const UpdateDailyTaskSchema = z
  .object({
    isCompleted: z.boolean().optional(),
    employeeId: z.string().min(1).optional(),
  })
  .refine(
    (data) => data.isCompleted !== undefined || data.employeeId !== undefined,
    "Either isCompleted or employeeId must be provided",
  );

const BatchWriteModeSchema = z
  .enum(["all-or-nothing", "partial"])
  .optional()
  .default("all-or-nothing");

const ManagerBatchDailyTasksSchema = z.object({
  taskIds: z.array(z.string().min(1)).min(1),
  employeeId: z.string().min(1).nullable(),
  mode: BatchWriteModeSchema,
});

const ManagerBatchTaskTemplatesSchema = z.object({
  templateIds: z.array(z.string().min(1)).min(1),
  action: z.enum([
    "assignToEmployee",
    "assignToWorkstation",
    "clearAssignment",
    "setNotifyEmployee",
  ]),
  employeeId: z.string().min(1).optional(),
  workstationId: z.string().min(1).optional(),
  notifyEmployee: z.boolean().optional(),
  mode: BatchWriteModeSchema,
});

const CreateTodayBoardTaskSchema = z.object({
  title: z.string().trim().min(1),
  assignedToEmployeeId: z.string().min(1).optional(),
  dueDate: z.string().optional(),
});

const CreateTaskFromTemplateSchema = z.object({
  assignedToEmployeeId: z.string().min(1).optional(),
  dueDate: z.string().optional(),
});

const QUICK_TASK_TEMPLATE_SOURCE_PREFIX = "quick";
const DATE_YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function resolveOperationalTimeZone(): string {
  const configured = process.env.OPERATIONAL_TIME_ZONE?.trim();
  if (configured) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: configured }).format(
        new Date(),
      );
      return configured;
    } catch {
      logger.warn(
        { configuredTimeZone: configured },
        "Invalid OPERATIONAL_TIME_ZONE, falling back to server timezone",
      );
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const OPERATIONAL_TIME_ZONE = resolveOperationalTimeZone();

function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateYmd(
  value: string,
): { year: number; month: number; day: number } | null {
  if (!DATE_YMD_REGEX.test(value)) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() + 1 !== month ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getDatePartsInTimeZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error("Failed to resolve date parts in operational timezone");
  }

  return { year, month, day };
}

function formatDateYmdInTimeZone(date: Date, timeZone: string): string {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  let current = new Date(utcGuess);

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(current, timeZone);
    const adjusted = new Date(utcGuess - offset);
    if (adjusted.getTime() === current.getTime()) break;
    current = adjusted;
  }

  return current;
}

function getOperationalTodayWindow(referenceDate = new Date()): {
  todayYmd: string;
  todayStart: Date;
  tomorrowStart: Date;
} {
  const todayYmd = formatDateYmdInTimeZone(
    referenceDate,
    OPERATIONAL_TIME_ZONE,
  );
  const parsed = parseDateYmd(todayYmd);
  if (!parsed) {
    throw new Error("Failed to parse operational date");
  }

  const todayStart = zonedDateTimeToUtc(
    parsed.year,
    parsed.month,
    parsed.day,
    0,
    0,
    0,
    0,
    OPERATIONAL_TIME_ZONE,
  );
  const tomorrowStart = zonedDateTimeToUtc(
    parsed.year,
    parsed.month,
    parsed.day + 1,
    0,
    0,
    0,
    0,
    OPERATIONAL_TIME_ZONE,
  );

  return { todayYmd, todayStart, tomorrowStart };
}

function parseOperationalDueDate(
  dueDateRaw: string,
  timeZone: string,
): Date | null {
  const normalized = dueDateRaw.trim();
  if (!normalized) return null;
  const parsed = parseDateYmd(normalized);
  if (!parsed) return null;
  return zonedDateTimeToUtc(
    parsed.year,
    parsed.month,
    parsed.day,
    0,
    0,
    0,
    0,
    timeZone,
  );
}

function quickTaskSourcePrefixForManager(managerId: string): string {
  return `${QUICK_TASK_TEMPLATE_SOURCE_PREFIX}:${managerId}:`;
}

function buildQuickTaskSourceId(managerId: string): string {
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  return `${quickTaskSourcePrefixForManager(managerId)}${uniqueSuffix}`;
}

function serializeTemplateResponse(template: {
  id: string;
  title: string;
  description: string | null;
  workstationId: string | null;
  assignedToEmployeeId: string | null;
  isRecurring: boolean;
  recurrenceType: string;
  recurrenceDays: string | null;
  targetPerWeek: number | null;
  notifyEmployee: boolean;
  createdAt: Date;
  updatedAt: Date;
  workstation?: { id: string; name: string } | null;
  assignedToEmployee?: { id: string; name: string; email: string } | null;
}) {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    workstationId: template.workstationId,
    assignedToEmployeeId: template.assignedToEmployeeId,
    isRecurring: template.isRecurring,
    recurrenceType: template.recurrenceType,
    recurrenceDays: parseRecurrenceDaysCsv(template.recurrenceDays),
    targetPerWeek: template.targetPerWeek,
    notifyEmployee: template.notifyEmployee,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    workstation: template.workstation,
    assignedToEmployee: template.assignedToEmployee,
  };
}

type DailyTaskTemplateProjection = {
  taskTemplateId: string | null;
  templateSourceId: string;
  templateTitle: string;
  templateDescription: string | null;
  templateRecurrenceType: string | null;
  templateIsRecurring: boolean;
  templateWorkstationId: string | null;
  templateWorkstationName: string | null;
  taskTemplate?: {
    id: string;
    title: string;
    description: string | null;
    isRecurring: boolean;
    recurrenceType?: string;
    workstation?: {
      id: string;
      name: string;
    } | null;
  } | null;
};

type DailyTaskWithSnapshotProjection = DailyTaskTemplateProjection & {
  id: string;
  employeeId: string | null;
  date: Date;
  status: string;
  isCompleted: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  employee?: {
    id: string;
    name: string;
    email: string;
    teamId?: string | null;
  } | null;
};

function normalizeSnapshotValue(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function serializeDailyTaskTemplate(task: DailyTaskTemplateProjection) {
  const snapshotSourceId = normalizeSnapshotValue(task.templateSourceId);
  const snapshotTitle = normalizeSnapshotValue(task.templateTitle);
  const hasSnapshot = snapshotSourceId !== null || snapshotTitle !== null;
  const title =
    snapshotTitle ??
    normalizeSnapshotValue(task.taskTemplate?.title) ??
    "Deleted template";
  const description = hasSnapshot
    ? task.templateDescription
    : (task.taskTemplate?.description ?? task.templateDescription);
  const isRecurring = hasSnapshot
    ? task.templateIsRecurring
    : (task.taskTemplate?.isRecurring ?? task.templateIsRecurring ?? true);
  const workstationName = hasSnapshot
    ? normalizeSnapshotValue(task.templateWorkstationName)
    : (normalizeSnapshotValue(task.taskTemplate?.workstation?.name) ??
      normalizeSnapshotValue(task.templateWorkstationName));
  const workstationId = hasSnapshot
    ? task.templateWorkstationId
    : (task.taskTemplate?.workstation?.id ?? task.templateWorkstationId);
  const templateId =
    normalizeSnapshotValue(task.taskTemplateId) ??
    snapshotSourceId ??
    normalizeSnapshotValue(task.taskTemplate?.id) ??
    "";

  return {
    id: templateId,
    title,
    description,
    isRecurring,
    ...(workstationName
      ? {
          workstation: {
            id: workstationId ?? "",
            name: workstationName,
          },
        }
      : {}),
  };
}

function serializeDailyTaskResponse(task: DailyTaskWithSnapshotProjection) {
  const response: {
    id: string;
    taskTemplateId: string | null;
    employeeId: string | null;
    date: string;
    status: string;
    isCompleted: boolean;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    taskTemplate: ReturnType<typeof serializeDailyTaskTemplate>;
    employee?: {
      id: string;
      name: string;
      email: string;
    };
  } = {
    id: task.id,
    taskTemplateId: task.taskTemplateId,
    employeeId: task.employeeId,
    date: task.date.toISOString(),
    status: task.status,
    isCompleted: task.isCompleted,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    taskTemplate: serializeDailyTaskTemplate(task),
  };

  if (task.employee) {
    response.employee = task.employee;
  }

  return response;
}

function buildDailyTaskSnapshot(template: {
  id: string;
  title: string;
  description: string | null;
  recurrenceType: string;
  isRecurring: boolean;
  workstation?: { id: string; name: string } | null;
}) {
  return {
    templateSourceId: template.id,
    templateTitle: template.title,
    templateDescription: template.description,
    templateRecurrenceType: template.recurrenceType,
    templateIsRecurring: template.isRecurring,
    templateWorkstationId: template.workstation?.id ?? null,
    templateWorkstationName: template.workstation?.name ?? null,
  };
}

function hasDeleteConfirmation(confirm: unknown): boolean {
  if (typeof confirm !== "string") return false;
  const normalized = confirm.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function hasTenantAccessToTeam(
  tenant: TenantContext,
  teamId: string | null | undefined,
): boolean {
  try {
    assertTenantAccessToResource(tenant, teamId);
    return true;
  } catch {
    return false;
  }
}

// Get all daily tasks for an employee on a specific date
export const handleGetEmployeeDailyTasks: RequestHandler = async (req, res) => {
  try {
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const scoped = scopedPrisma(tenant);

    const query = req.query as Record<string, unknown>;
    const parsedDate = parseDateQueryParam(query.date, query);
    if ("error" in parsedDate) {
      res.status(400).json({ error: parsedDate.error });
      return;
    }
    const taskDate = parsedDate.date;

    const tasks = await scoped.dailyTask.findMany({
      where: {
        employeeId: tenant.userId,
        status: { in: ["ASSIGNED", "DONE"] },
        date: {
          gte: taskDate,
          lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: {
        taskTemplate: {
          select: {
            id: true,
            title: true,
            description: true,
            isRecurring: true,
            recurrenceType: true,
            workstation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(tasks.map((task) => serializeDailyTaskResponse(task)));
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Update a daily task completion status
export const handleUpdateDailyTask: RequestHandler = async (req, res) => {
  try {
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const scoped = scopedPrisma(tenant);

    const taskId = paramString(req.params.taskId);
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const body = UpdateDailyTaskSchema.parse(req.body);

    const task = await scoped.dailyTask.findFirst({
      where: { id: taskId },
      include: {
        employee: {
          select: {
            id: true,
            teamId: true,
          },
        },
        taskTemplate: {
          select: {
            createdById: true,
            workstation: {
              select: { teamId: true },
            },
            assignedToEmployee: {
              select: { teamId: true, role: true },
            },
          },
        },
      },
    });

    if (!task) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const taskScopeTeamId =
      task.employee?.teamId ??
      task.taskTemplate?.workstation?.teamId ??
      (task.taskTemplate?.assignedToEmployee?.role === "EMPLOYEE"
        ? (task.taskTemplate.assignedToEmployee.teamId ?? null)
        : null);

    if (tenant.role === "MANAGER" && taskScopeTeamId) {
      assertManagerOwnsTeam(tenant, taskScopeTeamId);
    }

    if (body.isCompleted !== undefined && tenant.role === "EMPLOYEE") {
      assertEmployeeOwnsTask(tenant, task);
    }

    if (body.employeeId !== undefined) {
      if (tenant.role !== "MANAGER") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const targetEmployee = await scoped.user.findFirst({
        where: {
          id: body.employeeId,
          role: "EMPLOYEE",
          teamId: { in: tenant.teamIds },
        },
        select: { id: true, role: true, teamId: true },
      });
      if (
        !targetEmployee ||
        targetEmployee.role !== "EMPLOYEE" ||
        !targetEmployee.teamId
      ) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }

      assertTenantAccessToResource(tenant, targetEmployee.teamId);

      if (
        taskScopeTeamId !== null &&
        targetEmployee.teamId !== taskScopeTeamId
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (body.employeeId !== task.employeeId) {
        const snapshotSourceId = normalizeSnapshotValue(task.templateSourceId);
        const duplicateScopeWhere = task.taskTemplateId
          ? { taskTemplateId: task.taskTemplateId }
          : snapshotSourceId
            ? { templateSourceId: snapshotSourceId }
            : null;

        if (duplicateScopeWhere) {
          const existing = await scoped.dailyTask.findFirst({
            where: {
              id: { not: task.id },
              ...duplicateScopeWhere,
              employeeId: body.employeeId,
              date: {
                gte: new Date(new Date(task.date).setHours(0, 0, 0, 0)),
                lt: new Date(new Date(task.date).setHours(24, 0, 0, 0)),
              },
            },
            select: { id: true },
          });
          if (existing) {
            res.status(409).json({
              error:
                "This employee already has this task template assigned for the same date.",
              code: "CONFLICT",
            });
            return;
          }
        }
      }
    }

    const updateData: {
      isCompleted?: boolean;
      completedAt?: Date | null;
      employeeId?: string;
      status?: "UNASSIGNED" | "ASSIGNED" | "DONE";
    } = {};
    const nextEmployeeId = body.employeeId ?? task.employeeId;
    if (body.isCompleted !== undefined) {
      updateData.isCompleted = body.isCompleted;
      updateData.completedAt = body.isCompleted ? new Date() : null;
      // Keep explicit status aligned with completion state.
      updateData.status = body.isCompleted
        ? "DONE"
        : nextEmployeeId
          ? "ASSIGNED"
          : "UNASSIGNED";
    }
    if (body.employeeId !== undefined) {
      updateData.employeeId = body.employeeId;
      if (updateData.status !== "DONE") {
        updateData.status = "ASSIGNED";
      }
      if (body.employeeId !== task.employeeId && task.isCompleted) {
        updateData.isCompleted = false;
        updateData.completedAt = null;
        updateData.status = "ASSIGNED";
      }
    }

    const updatedTask = await scoped.dailyTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        taskTemplate: {
          select: {
            id: true,
            title: true,
            description: true,
            isRecurring: true,
            recurrenceType: true,
            workstation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            teamId: true,
          },
        },
      },
    });
    const serializedTask = serializeDailyTaskResponse(updatedTask);

    // Emit socket.io event to notify manager (team room only)
    const io = getIO();
    const socketTeamId = updatedTask.employee?.teamId ?? taskScopeTeamId;
    if (io && socketTeamId) {
      const taskTitle = serializedTask.taskTemplate.title || "Task";
      io.to(`team:${socketTeamId}`).emit("task:updated", {
        taskId: updatedTask.id,
        employeeId: updatedTask.employeeId,
        isCompleted: updatedTask.isCompleted,
        taskTitle,
      });
    }

    res.json(serializedTask);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleManagerBatchUpdateDailyTasks: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    if (payload.role !== "MANAGER") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = ManagerBatchDailyTasksSchema.parse(req.body);
    const uniqueTaskIds = Array.from(new Set(body.taskIds));

    const managerTeamIds = new Set(tenant.teamIds);
    if (managerTeamIds.size === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const tasks = await prisma.dailyTask.findMany({
      where: { id: { in: uniqueTaskIds } },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
            teamId: true,
            role: true,
          },
        },
        taskTemplate: {
          select: {
            id: true,
            title: true,
            description: true,
            isRecurring: true,
            recurrenceType: true,
            workstation: {
              select: { id: true, name: true, teamId: true },
            },
            assignedToEmployee: {
              select: { id: true, teamId: true, role: true },
            },
            createdById: true,
          },
        },
      },
    });

    if (tasks.length === 0) {
      res.status(404).json({ error: "No tasks found" });
      return;
    }

    if (tasks.length !== uniqueTaskIds.length) {
      res.status(404).json({ error: "One or more tasks not found" });
      return;
    }

    let targetEmployee: {
      id: string;
      teamId: string | null;
      role: "EMPLOYEE" | "MANAGER";
    } | null = null;

    if (body.employeeId !== null) {
      const employee = await prisma.user.findUnique({
        where: { id: body.employeeId },
        select: { id: true, role: true, teamId: true },
      });
      if (
        !employee ||
        employee.role !== "EMPLOYEE" ||
        !employee.teamId ||
        !hasTenantAccessToTeam(tenant, employee.teamId)
      ) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }
      targetEmployee = {
        id: employee.id,
        teamId: employee.teamId,
        role: "EMPLOYEE",
      };
    }

    const taskScopeTeamIds = new Map<string, string | null>();

    for (const task of tasks) {
      let taskTeamId: string | null = null;

      if (
        task.employee &&
        task.employee.role === "EMPLOYEE" &&
        task.employee.teamId
      ) {
        taskTeamId = task.employee.teamId;
      } else if (task.taskTemplate?.workstation?.teamId) {
        taskTeamId = task.taskTemplate.workstation.teamId;
      } else if (
        task.taskTemplate?.assignedToEmployee &&
        task.taskTemplate.assignedToEmployee.role === "EMPLOYEE" &&
        task.taskTemplate.assignedToEmployee.teamId
      ) {
        taskTeamId = task.taskTemplate.assignedToEmployee.teamId;
      }

      const isQuickTaskOwnedByManager =
        payload.role === "MANAGER" &&
        task.employeeId === null &&
        task.templateSourceId.startsWith(
          quickTaskSourcePrefixForManager(payload.userId),
        );

      if (
        taskTeamId !== null &&
        !hasTenantAccessToTeam(tenant, taskTeamId) &&
        !isQuickTaskOwnedByManager
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (taskTeamId === null && !isQuickTaskOwnedByManager) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      taskScopeTeamIds.set(task.id, taskTeamId);
    }

    if (targetEmployee) {
      for (const task of tasks) {
        const taskTeamId = taskScopeTeamIds.get(task.id);
        if (
          taskTeamId &&
          targetEmployee.teamId &&
          taskTeamId !== targetEmployee.teamId
        ) {
          res.status(400).json({
            error:
              "Target employee must belong to the same team as the selected tasks",
          });
          return;
        }
      }
    }

    const mode = body.mode ?? "all-or-nothing";

    type ConflictItem = { id: string; reason: string };
    const conflicts: ConflictItem[] = [];
    const conflictTaskIds = new Set<string>();

    const { updatedTasks } = await prisma.$transaction(async (tx) => {
      if (body.employeeId !== null && targetEmployee) {
        // 1) Intra-selection conflict detection: avoid assigning twice the same
        //    template/snapshot to the same employee for the same date in a single batch.
        const seenScopes = new Map<string, string>();
        for (const task of tasks) {
          const snapshotSourceId = normalizeSnapshotValue(
            task.templateSourceId,
          );
          const scopeKey = task.taskTemplateId ?? snapshotSourceId ?? null;
          if (!scopeKey) continue;
          const dateKey = formatDateYmd(task.date);
          const compositeKey = `${scopeKey}:${dateKey}:${body.employeeId}`;
          if (seenScopes.has(compositeKey)) {
            conflicts.push({
              id: task.id,
              reason: "duplicate_in_batch",
            });
            conflictTaskIds.add(task.id);
            continue;
          }
          seenScopes.set(compositeKey, task.id);
        }

        // 2) Existing DB conflicts for other tasks on the same day.
        for (const task of tasks) {
          if (
            conflictTaskIds.has(task.id) ||
            body.employeeId === task.employeeId
          ) {
            continue;
          }

          const snapshotSourceId = normalizeSnapshotValue(
            task.templateSourceId,
          );
          const duplicateScopeWhere = task.taskTemplateId
            ? { taskTemplateId: task.taskTemplateId }
            : snapshotSourceId
              ? { templateSourceId: snapshotSourceId }
              : null;

          if (!duplicateScopeWhere) continue;

          const existing = await tx.dailyTask.findFirst({
            where: {
              // Only consider conflicts with tasks that are NOT part of the current batch
              // selection. Intra-batch duplicates are reported as "duplicate_in_batch".
              id: { notIn: uniqueTaskIds },
              ...duplicateScopeWhere,
              employeeId: body.employeeId,
              date: {
                gte: new Date(new Date(task.date).setHours(0, 0, 0, 0)),
                lt: new Date(new Date(task.date).setHours(24, 0, 0, 0)),
              },
            },
            select: { id: true },
          });

          if (existing) {
            conflicts.push({
              id: task.id,
              reason: "duplicate_template_date_employee",
            });
            conflictTaskIds.add(task.id);
          }
        }
      }

      // When unassigning, ensure we won't violate the partial unique index
      // DailyTask_unassigned_template_date_unique (taskTemplateId, date, employeeId NULL, status UNASSIGNED).
      if (body.employeeId === null) {
        type UnassignGroup = {
          templateId: string;
          date: Date;
          taskIdsToUnassign: string[];
        };
        const unassignGroups = new Map<string, UnassignGroup>();

        for (const task of tasks) {
          if (!task.taskTemplateId) continue;
          const willBecomeUnassigned =
            task.employeeId !== null || task.status !== "UNASSIGNED";
          if (!willBecomeUnassigned) continue;

          const key = `${task.taskTemplateId}:${task.date.toISOString()}`;
          let group = unassignGroups.get(key);
          if (!group) {
            group = {
              templateId: task.taskTemplateId,
              date: task.date,
              taskIdsToUnassign: [],
            };
            unassignGroups.set(key, group);
          }
          group.taskIdsToUnassign.push(task.id);
        }

        for (const group of unassignGroups.values()) {
          if (group.taskIdsToUnassign.length === 0) continue;

          const existingUnassigned = await tx.dailyTask.findFirst({
            where: {
              taskTemplateId: group.templateId,
              date: group.date,
              employeeId: null,
              status: "UNASSIGNED",
            },
            select: { id: true },
          });

          const existingCount = existingUnassigned ? 1 : 0;
          const allowedUnassign = Math.max(0, 1 - existingCount);
          const toMark = group.taskIdsToUnassign.slice(allowedUnassign);
          for (const taskId of toMark) {
            conflicts.push({
              id: taskId,
              reason: "unassign_multiple_unassigned",
            });
            conflictTaskIds.add(taskId);
          }
        }
      }

      if (conflicts.length > 0 && mode === "all-or-nothing") {
        return { updatedTasks: [] as DailyTaskWithSnapshotProjection[] };
      }

      const tasksToUpdate =
        mode === "partial"
          ? tasks.filter((t) => !conflictTaskIds.has(t.id))
          : tasks;

      const results: DailyTaskWithSnapshotProjection[] = [];
      for (const task of tasksToUpdate) {
        const updateData: {
          isCompleted?: boolean;
          completedAt?: Date | null;
          employeeId?: string | null;
          status?: "UNASSIGNED" | "ASSIGNED" | "DONE";
        } = {};

        if (body.employeeId === null) {
          updateData.employeeId = null;
          updateData.isCompleted = false;
          updateData.completedAt = null;
          updateData.status = "UNASSIGNED";
        } else if (targetEmployee) {
          if (body.employeeId !== task.employeeId) {
            updateData.employeeId = body.employeeId;
            updateData.status = "ASSIGNED";
            if (task.isCompleted) {
              updateData.isCompleted = false;
              updateData.completedAt = null;
            }
          }
        }

        if (
          Object.keys(updateData).length === 0 ||
          (updateData.employeeId === task.employeeId &&
            updateData.isCompleted === task.isCompleted)
        ) {
          continue;
        }

        const updated = await tx.dailyTask.update({
          where: { id: task.id },
          data: updateData,
          include: {
            taskTemplate: {
              select: {
                id: true,
                title: true,
                description: true,
                isRecurring: true,
                recurrenceType: true,
                workstation: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            employee: {
              select: {
                id: true,
                name: true,
                email: true,
                teamId: true,
              },
            },
          },
        });
        results.push(updated as unknown as DailyTaskWithSnapshotProjection);
      }

      return { updatedTasks: results };
    });

    const io = getIO();

    for (const task of updatedTasks) {
      const serializedTask = serializeDailyTaskResponse(task);
      const taskScopeTeamId = taskScopeTeamIds.get(task.id) ?? null;
      const socketTeamId = task.employee?.teamId ?? taskScopeTeamId;
      if (io && socketTeamId) {
        const taskTitle = serializedTask.taskTemplate.title || "Task";
        io.to(`team:${socketTeamId}`).emit("task:updated", {
          taskId: task.id,
          employeeId: task.employeeId,
          isCompleted: task.isCompleted,
          taskTitle,
        });
      }
    }

    res.json({
      success: true,
      updatedCount: updatedTasks.length,
      skippedCount: conflicts.length,
      conflicts,
    });
  } catch (error) {
    // Map unique constraint violations on daily tasks to a clear 409 business error.
    const err = error as {
      code?: string;
      name?: string;
      meta?: { target?: string };
    };
    if (err && err.code === "P2002") {
      const indexTarget = err.meta?.target;
      const errorMessage =
        indexTarget === "DailyTask_unassigned_template_date_unique"
          ? "Cannot create another unassigned occurrence for the same template and date."
          : "This employee already has one of the selected task templates for the same date.";
      res.status(409).json({
        error: errorMessage,
        code: "CONFLICT",
      });
      return;
    }
    sendErrorResponse(res, error, req);
  }
};

export const handleGetManagerTodayBoard: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);

    const { todayYmd, todayStart, tomorrowStart } = getOperationalTodayWindow();

    // Ensure recurring tasks for today exist before assembling operational board data.
    await assignDailyTasksForDate(todayStart);

    const teamIds = tenant.teamIds;
    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const workstationRows = await prisma.workstation.findMany({
      where: {
        teamId: { in: teamIds },
      },
      select: { id: true },
    });
    const workstationIds = workstationRows.map((row) => row.id);

    const taskVisibilityScopes: Array<Record<string, unknown>> = [
      {
        employee: {
          role: "EMPLOYEE",
          teamId: { in: teamIds },
        },
      },
      {
        employeeId: null,
        taskTemplate: {
          workstation: {
            teamId: { in: teamIds },
          },
        },
      },
      {
        employeeId: null,
        taskTemplate: {
          assignedToEmployee: {
            role: "EMPLOYEE",
            teamId: { in: teamIds },
          },
        },
      },
      {
        employeeId: null,
        templateSourceId: {
          startsWith: quickTaskSourcePrefixForManager(payload.userId),
        },
      },
    ];
    if (workstationIds.length > 0) {
      taskVisibilityScopes.push({
        employeeId: null,
        templateWorkstationId: { in: workstationIds },
      });
    }

    const rows = await prisma.dailyTask.findMany({
      where: {
        AND: [
          { OR: taskVisibilityScopes },
          {
            OR: [
              {
                completedAt: null,
                date: { lt: todayStart },
              },
              {
                completedAt: null,
                date: { gte: todayStart, lt: tomorrowStart },
              },
              {
                completedAt: { gte: todayStart, lt: tomorrowStart },
              },
            ],
          },
        ],
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        taskTemplate: {
          select: {
            id: true,
            title: true,
            description: true,
            isRecurring: true,
            recurrenceType: true,
            workstation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    const seenTaskIds = new Set<string>();
    const overdue: Array<ReturnType<typeof serializeDailyTaskResponse>> = [];
    const today: Array<ReturnType<typeof serializeDailyTaskResponse>> = [];
    const completedToday: Array<ReturnType<typeof serializeDailyTaskResponse>> =
      [];

    for (const row of rows) {
      if (seenTaskIds.has(row.id)) continue;
      seenTaskIds.add(row.id);

      const serialized = serializeDailyTaskResponse(row);
      const task = {
        ...serialized,
        priorityScore: computeTaskPriorityScore(
          {
            date: row.date,
            isCompleted: row.isCompleted,
            employeeId: row.employeeId,
          },
          todayStart,
          tomorrowStart,
        ),
      };
      const completedAt = row.completedAt;
      if (
        completedAt &&
        completedAt >= todayStart &&
        completedAt < tomorrowStart
      ) {
        completedToday.push(task);
        continue;
      }

      if (!completedAt && row.date < todayStart) {
        overdue.push(task);
        continue;
      }

      if (!completedAt && row.date >= todayStart && row.date < tomorrowStart) {
        today.push(task);
      }
    }

    res.json({
      date: todayYmd,
      overdue,
      today,
      completedToday,
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleCreateManagerTodayBoardTask: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);

    const body = CreateTodayBoardTaskSchema.parse(req.body);
    const { todayStart } = getOperationalTodayWindow();
    let dueDate = todayStart;
    if (body.dueDate !== undefined) {
      if (body.dueDate.trim().length > 0) {
        const parsedDueDate = parseOperationalDueDate(
          body.dueDate,
          OPERATIONAL_TIME_ZONE,
        );
        if (!parsedDueDate) {
          res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });
          return;
        }
        dueDate = parsedDueDate;
      }
    }

    const managerTeamIds = new Set(tenant.teamIds);
    if (managerTeamIds.size === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    let assignedEmployeeId: string | null = null;
    if (body.assignedToEmployeeId) {
      const employee = await prisma.user.findUnique({
        where: { id: body.assignedToEmployeeId },
        select: {
          id: true,
          role: true,
          teamId: true,
        },
      });
      if (
        !employee ||
        employee.role !== "EMPLOYEE" ||
        !employee.teamId ||
        !hasTenantAccessToTeam(tenant, employee.teamId)
      ) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }
      assignedEmployeeId = employee.id;
    }

    const createdTask = await prisma.dailyTask.create({
      data: {
        taskTemplateId: null,
        templateSourceId: buildQuickTaskSourceId(payload.userId),
        templateTitle: body.title,
        templateDescription: null,
        templateRecurrenceType: null,
        templateIsRecurring: false,
        templateWorkstationId: null,
        templateWorkstationName: null,
        employeeId: assignedEmployeeId,
        date: dueDate,
        status: assignedEmployeeId ? "ASSIGNED" : "UNASSIGNED",
        isCompleted: false,
        completedAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        taskTemplate: {
          select: {
            id: true,
            title: true,
            description: true,
            isRecurring: true,
            recurrenceType: true,
            workstation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(serializeDailyTaskResponse(createdTask));
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Create a task template (manager only)
export const handleCreateTaskTemplate: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    const taskTemplate = await createTaskTemplateTransactional({
      userId: payload.userId,
      body: req.body,
      db: prisma,
    });

    res.status(201).json(serializeTemplateResponse(taskTemplate));
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

/** Assign a daily task from an existing template without creating a new template. */
export const handleAssignTaskFromTemplate: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    const body = AssignTaskFromTemplateSchema.parse(req.body);

    const template = await prisma.taskTemplate.findUnique({
      where: { id: body.templateId },
      include: {
        createdBy: { select: { id: true } },
        workstation: { select: { id: true, name: true, teamId: true } },
        assignedToEmployee: { select: { id: true, teamId: true, role: true } },
      },
    });

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const templateTeamId =
      template.workstation?.teamId ??
      template.assignedToEmployee?.teamId ??
      null;
    const canAccessUnassignedTemplate =
      templateTeamId === null && template.createdBy.id === payload.userId;
    if (
      (templateTeamId === null && !canAccessUnassignedTemplate) ||
      (templateTeamId !== null &&
        !hasTenantAccessToTeam(tenant, templateTeamId))
    ) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const taskDate = parseDateQuery(body.date);
    if (!taskDate) {
      res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });
      return;
    }
    const taskDateYmd = formatDateYmd(taskDate);

    let targetEmployeeIds: string[] = [];
    if (body.assignmentType === "employee") {
      const employee = await prisma.user.findUnique({
        where: { id: body.assignedToEmployeeId },
        select: { id: true, role: true, teamId: true, email: true, name: true },
      });
      if (
        !employee ||
        employee.role !== "EMPLOYEE" ||
        !employee.teamId ||
        !hasTenantAccessToTeam(tenant, employee.teamId)
      ) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }
      targetEmployeeIds = [employee.id];
    } else {
      const workstation = await prisma.workstation.findUnique({
        where: { id: body.workstationId },
        select: { id: true, teamId: true },
      });
      if (
        !workstation ||
        !workstation.teamId ||
        !hasTenantAccessToTeam(tenant, workstation.teamId)
      ) {
        res.status(404).json({ error: "Workstation not found" });
        return;
      }
      const employeeLinks = await prisma.employeeWorkstation.findMany({
        where: {
          workstationId: workstation.id,
          employee: {
            role: "EMPLOYEE",
            teamId: workstation.teamId,
          },
        },
        select: { employeeId: true },
      });
      targetEmployeeIds = employeeLinks.map((link) => link.employeeId);
    }

    let createdCount = 0;
    let skippedCount = 0;
    const notifyEmployee = body.notifyEmployee ?? template.notifyEmployee;
    const taskSnapshot = buildDailyTaskSnapshot(template);
    for (const employeeId of targetEmployeeIds) {
      const existing = await prisma.dailyTask.findFirst({
        where: {
          taskTemplateId: template.id,
          date: {
            gte: taskDate,
            lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
          },
          employeeId,
        },
        select: { id: true },
      });
      if (existing) {
        skippedCount += 1;
        continue;
      }

      let createdTask = null as null | { id: string };
      if (template.isRecurring) {
        const unassigned = await prisma.dailyTask.findFirst({
          where: {
            taskTemplateId: template.id,
            date: {
              gte: taskDate,
              lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
            },
            status: "UNASSIGNED",
            employeeId: null,
          },
          select: { id: true },
        });
        if (unassigned) {
          createdTask = await prisma.dailyTask.update({
            where: { id: unassigned.id },
            data: {
              employeeId,
              status: "ASSIGNED",
              isCompleted: false,
              completedAt: null,
            },
            select: { id: true },
          });
        }
      }
      if (!createdTask) {
        createdTask = await prisma.dailyTask.create({
          data: {
            taskTemplateId: template.id,
            ...taskSnapshot,
            employeeId,
            date: taskDate,
            status: "ASSIGNED",
            isCompleted: false,
          },
          select: { id: true },
        });
      }
      createdCount += 1;

      if (!notifyEmployee) continue;
      const employee = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { email: true, name: true },
      });
      if (!employee) continue;

      const io = getIO();
      if (io) {
        io.to(`user:${employeeId}`).emit("task:assigned", {
          taskId: createdTask.id,
          employeeId,
          taskDate: taskDateYmd,
          employeeName: employee.name,
          taskTitle: template.title,
          taskDescription: template.description,
        });
      }

      try {
        await sendTaskAssignmentEmail(
          employee.email,
          employee.name,
          template.title,
          template.description || undefined,
        );
      } catch {
        logger.info("Email notification skipped (email service not available)");
      }
    }

    res.status(201).json({
      success: true,
      templateId: template.id,
      date: taskDateYmd,
      createdCount,
      skippedCount,
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleGetManualTriggerTemplates: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);

    const managerTeamIds = tenant.teamIds;

    const templates = await prisma.taskTemplate.findMany({
      where: {
        isRecurring: true,
        recurrenceMode: "manual_trigger",
        OR: [
          {
            workstation: {
              teamId: { in: managerTeamIds },
            },
          },
          {
            assignedToEmployee: {
              role: "EMPLOYEE",
              teamId: { in: managerTeamIds },
            },
          },
          {
            createdById: payload.userId,
            workstationId: null,
            assignedToEmployeeId: null,
          },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
      },
      orderBy: [{ title: "asc" }, { createdAt: "desc" }],
    });

    res.json(templates);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleCreateTaskFromTemplate: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    const templateId = paramString(req.params.templateId);
    if (!templateId) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }

    const body = CreateTaskFromTemplateSchema.parse(req.body ?? {});
    let dueDate = getOperationalTodayWindow().todayStart;
    if (body.dueDate !== undefined && body.dueDate.trim().length > 0) {
      const parsedDueDate = parseOperationalDueDate(
        body.dueDate,
        OPERATIONAL_TIME_ZONE,
      );
      if (!parsedDueDate) {
        res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });
        return;
      }
      dueDate = parsedDueDate;
    }

    const result = await instantiateManualTriggerTemplateTaskTransactional({
      managerUserId: payload.userId,
      templateId,
      dueDate,
      assignedToEmployeeId: body.assignedToEmployeeId ?? null,
      db: prisma,
    });

    res
      .status(result.created ? 201 : 200)
      .json(serializeDailyTaskResponse(result.task));
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Get all task templates for a manager (manager only)
export const handleGetTaskTemplates: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);

    const managerTeamIds = tenant.teamIds;
    if (managerTeamIds.length === 0) {
      res.json([]);
      return;
    }

    // Get all templates that belong to workstations or employees in managed teams
    // Use separate queries and filter to avoid cross-team exposure from legacy data
    const templatesWithWorkstation = await prisma.taskTemplate.findMany({
      where: {
        workstationId: { not: null },
        workstation: {
          teamId: { in: managerTeamIds },
        },
      },
      include: {
        workstation: {
          select: {
            id: true,
            name: true,
            teamId: true, // Include for additional validation
          },
        },
        assignedToEmployee: {
          select: {
            id: true,
            name: true,
            email: true,
            teamId: true, // Include for additional validation
          },
        },
      },
    });

    const templatesWithEmployee = await prisma.taskTemplate.findMany({
      where: {
        assignedToEmployeeId: { not: null },
        assignedToEmployee: {
          teamId: { in: managerTeamIds },
          role: "EMPLOYEE",
        },
      },
      include: {
        workstation: {
          select: {
            id: true,
            name: true,
            teamId: true,
          },
        },
        assignedToEmployee: {
          select: {
            id: true,
            name: true,
            email: true,
            teamId: true,
          },
        },
      },
    });

    const unassignedTemplatesOwnedByManager =
      await prisma.taskTemplate.findMany({
        where: {
          createdById: payload.userId,
          isRecurring: true,
          workstationId: null,
          assignedToEmployeeId: null,
        },
        include: {
          workstation: {
            select: {
              id: true,
              name: true,
              teamId: true,
            },
          },
          assignedToEmployee: {
            select: {
              id: true,
              name: true,
              email: true,
              teamId: true,
            },
          },
        },
      });

    // Combine and deduplicate, ensuring all belong to managed teams
    // Also filter out cross-team relationships (e.g., template with workstation in managed team
    // but assignedToEmployee in another team should not expose that employee)
    const templateMap = new Map<string, (typeof templatesWithWorkstation)[0]>();

    for (const template of templatesWithWorkstation) {
      // Verify workstation belongs to managed team
      if (
        template.workstation?.teamId &&
        hasTenantAccessToTeam(tenant, template.workstation.teamId)
      ) {
        // If template has assignedToEmployee, verify it also belongs to managed team
        // Otherwise, don't expose the cross-team relationship
        if (template.assignedToEmployee) {
          if (
            template.assignedToEmployee.teamId &&
            hasTenantAccessToTeam(tenant, template.assignedToEmployee.teamId)
          ) {
            templateMap.set(template.id, template);
          } else {
            // Template is valid via workstation, but assignedToEmployee is cross-team
            // Include template but nullify the cross-team employee relation
            templateMap.set(template.id, {
              ...template,
              assignedToEmployee: null,
            });
          }
        } else {
          templateMap.set(template.id, template);
        }
      }
    }

    for (const template of templatesWithEmployee) {
      // Verify assignedToEmployee belongs to managed team
      if (
        template.assignedToEmployee?.teamId &&
        hasTenantAccessToTeam(tenant, template.assignedToEmployee.teamId)
      ) {
        // If template already exists in map (from workstation query), skip if it's the same
        if (!templateMap.has(template.id)) {
          // If template has workstation, verify it also belongs to managed team
          if (template.workstation) {
            if (
              template.workstation.teamId &&
              hasTenantAccessToTeam(tenant, template.workstation.teamId)
            ) {
              templateMap.set(template.id, template);
            } else {
              // Template is valid via employee, but workstation is cross-team
              // Include template but nullify the cross-team workstation relation
              templateMap.set(template.id, {
                ...template,
                workstation: null,
              });
            }
          } else {
            templateMap.set(template.id, template);
          }
        }
      }
    }

    for (const template of unassignedTemplatesOwnedByManager) {
      if (!templateMap.has(template.id)) {
        templateMap.set(template.id, template);
      }
    }

    // Remove workstation/employee teamId from response (internal only).
    // Never expose cross-team IDs: when a relation is nullified (unmanaged team),
    // also nullify the corresponding id field so no cross-team metadata is leaked.
    const templates = Array.from(templateMap.values())
      .map((t) => {
        const workstationOk =
          t.workstation &&
          t.workstation.teamId &&
          hasTenantAccessToTeam(tenant, t.workstation.teamId);
        const employeeOk =
          t.assignedToEmployee &&
          t.assignedToEmployee.teamId &&
          hasTenantAccessToTeam(tenant, t.assignedToEmployee.teamId);
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          workstationId: workstationOk ? t.workstationId : null,
          assignedToEmployeeId: employeeOk ? t.assignedToEmployeeId : null,
          isRecurring: t.isRecurring,
          recurrenceType: t.recurrenceType,
          recurrenceDays: parseRecurrenceDaysCsv(t.recurrenceDays),
          targetPerWeek: t.targetPerWeek,
          notifyEmployee: t.notifyEmployee,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          workstation: workstationOk
            ? { id: t.workstation!.id, name: t.workstation!.name }
            : null,
          assignedToEmployee: employeeOk
            ? {
                id: t.assignedToEmployee!.id,
                name: t.assignedToEmployee!.name,
                email: t.assignedToEmployee!.email,
              }
            : null,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    res.json(templates);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleManagerBatchUpdateTaskTemplates: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    if (payload.role !== "MANAGER") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const body = ManagerBatchTaskTemplatesSchema.parse(req.body);
    const uniqueTemplateIds = Array.from(new Set(body.templateIds));

    const managerTeamIds = tenant.teamIds;
    if (managerTeamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    if (
      (body.action === "assignToEmployee" && !body.employeeId) ||
      (body.action === "assignToWorkstation" && !body.workstationId) ||
      (body.action === "setNotifyEmployee" && body.notifyEmployee === undefined)
    ) {
      res.status(400).json({ error: "Invalid batch payload" });
      return;
    }

    const templates = await prisma.taskTemplate.findMany({
      where: { id: { in: uniqueTemplateIds } },
      include: {
        createdBy: {
          select: { id: true },
        },
        workstation: {
          select: { teamId: true },
        },
        assignedToEmployee: {
          select: { teamId: true, role: true },
        },
      },
    });

    if (templates.length === 0) {
      res.status(404).json({ error: "No templates found" });
      return;
    }
    if (templates.length !== uniqueTemplateIds.length) {
      res.status(404).json({ error: "One or more templates not found" });
      return;
    }

    for (const template of templates) {
      const templateTeamId =
        template.workstation?.teamId || template.assignedToEmployee?.teamId;
      const canAccessUnassignedTemplate =
        !templateTeamId && template.createdBy.id === payload.userId;
      if (
        (!templateTeamId && !canAccessUnassignedTemplate) ||
        (templateTeamId && !hasTenantAccessToTeam(tenant, templateTeamId))
      ) {
        res.status(404).json({ error: "Template not found" });
        return;
      }
    }

    let targetWorkstationId: string | null = null;
    let targetEmployeeId: string | null = null;

    if (body.action === "assignToWorkstation" && body.workstationId) {
      const workstation = await prisma.workstation.findUnique({
        where: { id: body.workstationId },
        select: { id: true, teamId: true },
      });
      if (
        !workstation ||
        !workstation.teamId ||
        !hasTenantAccessToTeam(tenant, workstation.teamId)
      ) {
        res.status(404).json({ error: "Workstation not found" });
        return;
      }
      targetWorkstationId = workstation.id;
    }

    if (body.action === "assignToEmployee" && body.employeeId) {
      const employee = await prisma.user.findUnique({
        where: { id: body.employeeId },
        select: { id: true, teamId: true, role: true },
      });
      if (
        !employee ||
        employee.role !== "EMPLOYEE" ||
        !employee.teamId ||
        !hasTenantAccessToTeam(tenant, employee.teamId)
      ) {
        res.status(404).json({ error: "Employee not found" });
        return;
      }
      targetEmployeeId = employee.id;
    }

    if (body.action === "clearAssignment") {
      const invalidOneShot = templates.find((t) => !t.isRecurring);
      if (invalidOneShot) {
        res.status(400).json({
          error:
            "Cannot clear assignment for one-shot templates. Only recurring templates can be left unassigned.",
        });
        return;
      }
    }

    if (
      body.action === "setNotifyEmployee" &&
      body.notifyEmployee !== undefined
    ) {
      const result = await prisma.taskTemplate.updateMany({
        where: { id: { in: uniqueTemplateIds } },
        data: { notifyEmployee: body.notifyEmployee },
      });

      res.json({
        success: true,
        updatedCount: result.count,
        skippedCount: 0,
        conflicts: [],
      });
      return;
    }

    let updatedCount = 0;

    if (body.action === "assignToEmployee" && targetEmployeeId) {
      await prisma.$transaction(async (tx) => {
        for (const template of templates) {
          await tx.taskTemplate.update({
            where: { id: template.id },
            data: {
              assignedToEmployeeId: targetEmployeeId,
              workstationId: null,
            },
          });
          updatedCount += 1;
        }
      });
    } else if (body.action === "assignToWorkstation" && targetWorkstationId) {
      await prisma.$transaction(async (tx) => {
        for (const template of templates) {
          await tx.taskTemplate.update({
            where: { id: template.id },
            data: {
              workstationId: targetWorkstationId,
              assignedToEmployeeId: null,
            },
          });
          updatedCount += 1;
        }
      });
    } else if (body.action === "clearAssignment") {
      await prisma.$transaction(async (tx) => {
        for (const template of templates) {
          await tx.taskTemplate.update({
            where: { id: template.id },
            data: {
              workstationId: null,
              assignedToEmployeeId: null,
            },
          });
          updatedCount += 1;
        }
      });
    }

    res.json({
      success: true,
      updatedCount,
      skippedCount: 0,
      conflicts: [],
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Update a task template (manager only)
export const handleUpdateTaskTemplate: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    const templateId = paramString(req.params.templateId);
    if (!templateId) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }

    const body = UpdateTaskTemplateSchema.parse(req.body);

    // First, verify the template exists and belongs to a managed team
    const existingTemplate = await prisma.taskTemplate.findUnique({
      where: { id: templateId },
      include: {
        createdBy: {
          select: { id: true },
        },
        workstation: {
          select: { teamId: true },
        },
        assignedToEmployee: {
          select: { teamId: true, role: true },
        },
      },
    });

    if (!existingTemplate) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Check if template belongs to a managed team
    const templateTeamId =
      existingTemplate.workstation?.teamId ||
      existingTemplate.assignedToEmployee?.teamId;
    const canAccessUnassignedTemplate =
      !templateTeamId && existingTemplate.createdBy.id === payload.userId;
    if (
      (!templateTeamId && !canAccessUnassignedTemplate) ||
      (templateTeamId && !hasTenantAccessToTeam(tenant, templateTeamId))
    ) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // If updating assignments, verify they belong to managed teams
    let workstationTeamId: string | null = null;
    if (body.workstationId !== undefined) {
      if (body.workstationId === null) {
        workstationTeamId = null;
      } else {
        const workstation = await prisma.workstation.findUnique({
          where: { id: body.workstationId },
          select: { teamId: true },
        });
        if (
          !workstation ||
          !workstation.teamId ||
          !hasTenantAccessToTeam(tenant, workstation.teamId)
        ) {
          res.status(404).json({ error: "Workstation not found" });
          return;
        }
        workstationTeamId = workstation.teamId;
      }
    } else {
      // Keep existing workstation team if not updating
      workstationTeamId = existingTemplate.workstation?.teamId || null;
    }

    let employeeTeamId: string | null = null;
    if (body.assignedToEmployeeId !== undefined) {
      if (body.assignedToEmployeeId === null) {
        employeeTeamId = null;
      } else {
        const user = await prisma.user.findUnique({
          where: { id: body.assignedToEmployeeId },
          select: { teamId: true, role: true },
        });
        if (
          !user ||
          user.role !== "EMPLOYEE" ||
          !user.teamId ||
          !hasTenantAccessToTeam(tenant, user.teamId)
        ) {
          res.status(404).json({ error: "Employee not found" });
          return;
        }
        employeeTeamId = user.teamId;
      }
    } else {
      // Keep existing employee team if not updating
      employeeTeamId = existingTemplate.assignedToEmployee?.teamId || null;
    }

    // When both are provided, they must belong to the same team
    if (
      workstationTeamId !== null &&
      employeeTeamId !== null &&
      workstationTeamId !== employeeTeamId
    ) {
      res.status(400).json({
        error: "Workstation and employee must belong to the same team",
      });
      return;
    }

    // One-shot templates must keep an assignment. Recurring templates can remain unassigned.
    const nextIsRecurring = body.isRecurring ?? existingTemplate.isRecurring;
    if (
      !nextIsRecurring &&
      workstationTeamId === null &&
      employeeTeamId === null
    ) {
      res.status(400).json({
        error:
          "Either workstationId or assignedToEmployeeId must be provided for one-shot templates",
      });
      return;
    }
    const nextRecurrenceMode = nextIsRecurring
      ? (body.recurrenceMode ??
        normalizeRecurrenceMode(existingTemplate.recurrenceMode))
      : "schedule_based";
    const nextRecurrenceType =
      body.recurrenceType ?? existingTemplate.recurrenceType;
    const nextRecurrenceDayOfMonth =
      body.recurrenceDayOfMonth !== undefined
        ? body.recurrenceDayOfMonth
        : existingTemplate.recurrenceDayOfMonth;
    const nextRecurrenceInterval =
      body.recurrenceInterval !== undefined
        ? body.recurrenceInterval
        : existingTemplate.recurrenceInterval;
    const nextRecurrenceIntervalUnit =
      body.recurrenceIntervalUnit !== undefined
        ? body.recurrenceIntervalUnit
        : existingTemplate.recurrenceIntervalUnit;

    if (
      nextIsRecurring &&
      nextRecurrenceMode === "schedule_based" &&
      nextRecurrenceType === "monthly" &&
      !nextRecurrenceDayOfMonth
    ) {
      res.status(400).json({
        error:
          "recurrenceDayOfMonth is required for monthly schedule-based templates",
      });
      return;
    }

    if (nextIsRecurring && nextRecurrenceMode === "after_completion") {
      if (!nextRecurrenceInterval || !nextRecurrenceIntervalUnit) {
        res.status(400).json({
          error:
            "recurrenceInterval and recurrenceIntervalUnit are required for after_completion mode",
        });
        return;
      }
    }

    const shouldSetRecurrenceDayOfMonth =
      body.recurrenceDayOfMonth !== undefined ||
      body.recurrenceType !== undefined ||
      body.recurrenceMode !== undefined ||
      body.isRecurring !== undefined;
    const shouldSetAfterCompletionConfig =
      body.recurrenceInterval !== undefined ||
      body.recurrenceIntervalUnit !== undefined ||
      body.recurrenceMode !== undefined ||
      body.isRecurring !== undefined;
    const resolvedRecurrenceDayOfMonth =
      nextIsRecurring &&
      nextRecurrenceMode === "schedule_based" &&
      nextRecurrenceType === "monthly"
        ? (nextRecurrenceDayOfMonth ?? null)
        : null;
    const resolvedRecurrenceInterval =
      nextIsRecurring && nextRecurrenceMode === "after_completion"
        ? (nextRecurrenceInterval ?? null)
        : null;
    const resolvedRecurrenceIntervalUnit =
      nextIsRecurring && nextRecurrenceMode === "after_completion"
        ? (nextRecurrenceIntervalUnit ?? null)
        : null;

    // Update the template
    const updatedTemplate = await prisma.taskTemplate.update({
      where: { id: templateId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && {
          description: body.description ?? null,
        }),
        ...(body.workstationId !== undefined && {
          workstationId: body.workstationId,
        }),
        ...(body.assignedToEmployeeId !== undefined && {
          assignedToEmployeeId: body.assignedToEmployeeId,
        }),
        ...(body.isRecurring !== undefined && {
          isRecurring: body.isRecurring,
        }),
        ...(body.recurrenceMode !== undefined && {
          recurrenceMode: body.recurrenceMode,
        }),
        ...(body.recurrenceType !== undefined && {
          recurrenceType: body.recurrenceType,
        }),
        ...(body.recurrenceDays !== undefined && {
          recurrenceDays:
            body.recurrenceDays && body.recurrenceDays.length > 0
              ? body.recurrenceDays.join(",")
              : null,
        }),
        ...(body.targetPerWeek !== undefined && {
          targetPerWeek: body.targetPerWeek,
        }),
        ...(shouldSetRecurrenceDayOfMonth && {
          recurrenceDayOfMonth: resolvedRecurrenceDayOfMonth,
        }),
        ...(shouldSetAfterCompletionConfig && {
          recurrenceInterval: resolvedRecurrenceInterval,
          recurrenceIntervalUnit: resolvedRecurrenceIntervalUnit,
        }),
        ...(body.notifyEmployee !== undefined && {
          notifyEmployee: body.notifyEmployee,
        }),
      },
      include: {
        workstation: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedToEmployee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json(serializeTemplateResponse(updatedTemplate));
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Delete a task template (manager only)
export const handleDeleteTaskTemplate: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    const templateId = paramString(req.params.templateId);
    if (!templateId) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }
    if (
      !hasDeleteConfirmation((req.query as Record<string, unknown>).confirm)
    ) {
      res.status(400).json({
        error:
          "Explicit confirmation is required to delete a template. Pass ?confirm=true.",
      });
      return;
    }

    // Verify the template exists and belongs to a managed team
    const template = await prisma.taskTemplate.findUnique({
      where: { id: templateId },
      include: {
        createdBy: {
          select: { id: true },
        },
        workstation: {
          select: { teamId: true },
        },
        assignedToEmployee: {
          select: { teamId: true },
        },
      },
    });

    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const templateTeamId =
      template.workstation?.teamId || template.assignedToEmployee?.teamId;
    const canAccessUnassignedTemplate =
      !templateTeamId && template.createdBy.id === payload.userId;
    if (
      (!templateTeamId && !canAccessUnassignedTemplate) ||
      (templateTeamId && !hasTenantAccessToTeam(tenant, templateTeamId))
    ) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Hard delete template while preserving execution history via SET NULL + snapshots.
    await prisma.taskTemplate.delete({
      where: { id: templateId },
    });

    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Cron: assign daily tasks for recurring templates (call each morning)
// Note: Secret verification is handled by verifyCronSecret middleware in index.ts
// This handler only processes requests that have already passed secret validation
export const handleDailyTaskAssignment: RequestHandler = async (req, res) => {
  try {
    // Secret is already verified by middleware, proceed directly to date validation
    const query = req.query as Record<string, unknown>;
    const parsedDate = parseDateQueryParam(query.date, query);
    if ("error" in parsedDate) {
      res.status(400).json({ error: parsedDate.error });
      return;
    }
    const targetDate = parsedDate.date;

    const result = await assignDailyTasksForDate(targetDate);

    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, "0");
    const d = String(targetDate.getDate()).padStart(2, "0");

    res.json({
      success: true,
      date: `${y}-${m}-${d}`,
      ...result,
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekRangeContaining(date: Date): {
  weekStart: Date;
  weekEnd: Date;
} {
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayOfWeek = dayStart.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = (dayOfWeek + 6) % 7; // days since Monday
  const weekStart = new Date(
    dayStart.getTime() - diffToMonday * 24 * 60 * 60 * 1000,
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000); // exclusive
  return { weekStart, weekEnd };
}

function isDelayedOccurrence(
  task: {
    date: Date;
    isCompleted: boolean;
    completedAt: Date | null;
  },
  now: Date,
): boolean {
  const dueTime = task.date.getTime();
  const endOfDueDay = new Date(task.date);
  endOfDueDay.setHours(24, 0, 0, 0);
  const endOfDueDayTime = endOfDueDay.getTime();

  if (!task.isCompleted) {
    return now.getTime() > endOfDueDayTime;
  }
  if (!task.completedAt) return false;
  return (
    task.completedAt.getTime() > endOfDueDayTime &&
    task.completedAt.getTime() > dueTime
  );
}

export const handleGetManagerWeeklyReport: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);

    const query = req.query as Record<string, unknown>;
    const parsedDate = parseDateQueryParam(query.date, query);
    if ("error" in parsedDate) {
      res.status(400).json({ error: parsedDate.error });
      return;
    }
    const referenceDate = parsedDate.date;
    const { weekStart, weekEnd } = getWeekRangeContaining(referenceDate);

    const teamIds = tenant.teamIds;
    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const workstationRows = await prisma.workstation.findMany({
      where: {
        teamId: { in: teamIds },
      },
      select: { id: true },
    });
    const workstationIds = workstationRows.map((row) => row.id);

    const taskVisibilityScopes: Array<Record<string, unknown>> = [
      {
        employee: {
          role: "EMPLOYEE",
          teamId: { in: teamIds },
        },
      },
      {
        employeeId: null,
        taskTemplate: {
          workstation: {
            teamId: { in: teamIds },
          },
        },
      },
      {
        employeeId: null,
        taskTemplate: {
          assignedToEmployee: {
            role: "EMPLOYEE",
            teamId: { in: teamIds },
          },
        },
      },
      {
        employeeId: null,
        templateSourceId: {
          startsWith: quickTaskSourcePrefixForManager(payload.userId),
        },
      },
    ];
    if (workstationIds.length > 0) {
      taskVisibilityScopes.push({
        employeeId: null,
        templateWorkstationId: { in: workstationIds },
      });
    }

    const rows = await prisma.dailyTask.findMany({
      where: {
        AND: [
          { OR: taskVisibilityScopes },
          {
            date: {
              gte: weekStart,
              lt: weekEnd,
            },
          },
        ],
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        taskTemplate: {
          select: {
            id: true,
            title: true,
            isRecurring: true,
            workstation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });

    const now = new Date();
    const daysInRange = Math.max(
      1,
      Math.round(
        (weekEnd.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
      ),
    );

    const summary: ManagerWeeklyReportSummary = {
      totalTasks: rows.length,
      completedTasks: rows.filter((t) => t.isCompleted).length,
      overdueTasks: rows.filter((t) => !t.isCompleted && t.date < now).length,
    };

    // Bottlenecks - employees
    const employeeDayCounts = new Map<
      string,
      { name: string; days: Map<string, number> }
    >();

    for (const row of rows) {
      if (!row.employee) continue;
      const employeeId = row.employee.id;
      const dayKey = formatDateOnly(row.date);
      let entry = employeeDayCounts.get(employeeId);
      if (!entry) {
        entry = { name: row.employee.name, days: new Map<string, number>() };
        employeeDayCounts.set(employeeId, entry);
      }
      entry.days.set(dayKey, (entry.days.get(dayKey) ?? 0) + 1);
    }

    const employeeBottlenecks: ManagerWeeklyReportEmployeeBottleneck[] = [];
    for (const [employeeId, entry] of employeeDayCounts.entries()) {
      const counts = Array.from(entry.days.values());
      const total = counts.reduce((sum, c) => sum + c, 0);
      const peak = counts.length > 0 ? Math.max(...counts) : 0;
      const avg = total / daysInRange;
      employeeBottlenecks.push({
        employeeId,
        name: entry.name,
        peakDayTaskCount: peak,
        averageDailyTaskCount: Number(avg.toFixed(2)),
      });
    }

    if (employeeBottlenecks.length > 0) {
      const meanPeak =
        employeeBottlenecks.reduce((sum, e) => sum + e.peakDayTaskCount, 0) /
        employeeBottlenecks.length;
      const threshold = Math.ceil(meanPeak) + 1;
      employeeBottlenecks.sort(
        (a, b) => b.peakDayTaskCount - a.peakDayTaskCount,
      );
      // Keep only employees clearly above average and cap list size
      const filtered = employeeBottlenecks.filter(
        (e) => e.peakDayTaskCount >= threshold,
      );
      employeeBottlenecks.length = 0;
      employeeBottlenecks.push(...filtered.slice(0, 5));
    }

    // Bottlenecks - workstations (sensitive posts)
    const workstationDayUncompleted = new Map<
      string,
      { name: string; days: Map<string, number> }
    >();

    for (const row of rows) {
      if (row.isCompleted) continue;
      const wsId =
        row.taskTemplate?.workstation?.id ??
        row.templateWorkstationId ??
        "direct";
      const wsName =
        row.taskTemplate?.workstation?.name ??
        row.templateWorkstationName ??
        "Direct";
      const dayKey = formatDateOnly(row.date);
      let entry = workstationDayUncompleted.get(wsId);
      if (!entry) {
        entry = { name: wsName, days: new Map<string, number>() };
        workstationDayUncompleted.set(wsId, entry);
      }
      entry.days.set(dayKey, (entry.days.get(dayKey) ?? 0) + 1);
    }

    const workstationBottlenecks: ManagerWeeklyReportWorkstationBottleneck[] =
      [];
    for (const [wsId, entry] of workstationDayUncompleted.entries()) {
      const counts = Array.from(entry.days.values());
      const total = counts.reduce((sum, c) => sum + c, 0);
      const peak = counts.length > 0 ? Math.max(...counts) : 0;
      const avg = total / daysInRange;
      workstationBottlenecks.push({
        workstationId: wsId === "direct" ? null : wsId,
        name: entry.name,
        peakDayUncompletedCount: peak,
        averageDailyUncompletedCount: Number(avg.toFixed(2)),
      });
    }

    if (workstationBottlenecks.length > 0) {
      const meanPeak =
        workstationBottlenecks.reduce(
          (sum, ws) => sum + ws.peakDayUncompletedCount,
          0,
        ) / workstationBottlenecks.length;
      const threshold = Math.ceil(meanPeak) + 1;
      workstationBottlenecks.sort(
        (a, b) => b.peakDayUncompletedCount - a.peakDayUncompletedCount,
      );
      const filtered = workstationBottlenecks.filter(
        (ws) => ws.peakDayUncompletedCount >= threshold,
      );
      workstationBottlenecks.length = 0;
      workstationBottlenecks.push(...filtered.slice(0, 5));
    }

    // Recurring delays
    const recurringByTemplate = new Map<
      string,
      {
        title: string;
        workstationName?: string;
        total: number;
        delayed: number;
      }
    >();

    for (const row of rows) {
      if (!row.taskTemplate || !row.taskTemplate.isRecurring) continue;
      const templateId = row.taskTemplate.id ?? row.taskTemplateId ?? "";
      if (!templateId) continue;
      let entry = recurringByTemplate.get(templateId);
      if (!entry) {
        entry = {
          title: row.taskTemplate.title,
          workstationName: row.taskTemplate.workstation?.name ?? undefined,
          total: 0,
          delayed: 0,
        };
        recurringByTemplate.set(templateId, entry);
      }
      entry.total += 1;
      if (
        isDelayedOccurrence(
          {
            date: row.date,
            isCompleted: row.isCompleted,
            completedAt: row.completedAt,
          },
          now,
        )
      ) {
        entry.delayed += 1;
      }
    }

    const recurringDelays: ManagerWeeklyReportRecurringDelay[] = [];
    for (const [templateId, entry] of recurringByTemplate.entries()) {
      if (entry.total === 0) continue;
      const delayRate = entry.delayed / entry.total;
      // Only surface meaningful patterns (at least 2 delayed and 30%+ delayed)
      if (entry.delayed < 2 || delayRate < 0.3) continue;
      recurringDelays.push({
        templateId,
        title: entry.title,
        workstationName: entry.workstationName,
        totalOccurrences: entry.total,
        delayedOccurrences: entry.delayed,
        delayRate: Number(delayRate.toFixed(2)),
      });
    }

    recurringDelays.sort((a, b) => {
      if (b.delayRate !== a.delayRate) {
        return b.delayRate - a.delayRate;
      }
      return b.delayedOccurrences - a.delayedOccurrences;
    });

    const report: ManagerWeeklyReport = {
      weekStart: formatDateOnly(weekStart),
      weekEnd: formatDateOnly(
        new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000),
      ),
      generatedAt: new Date().toISOString(),
      summary,
      bottlenecks: {
        employees: employeeBottlenecks,
        workstations: workstationBottlenecks,
      },
      recurringDelays: recurringDelays.slice(0, 10),
    };

    res.json(report);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Get dashboard data for manager (all managed teams; multi-team supported)
export const handleGetManagerDashboard: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const tenant = getTenantOrThrow(req, res);
    if (!tenant) return;
    const prisma = scopedPrisma(tenant);
    const parsedQuery = parseManagerDashboardQuery(req.query);
    if ("error" in parsedQuery) {
      res.status(400).json({ error: parsedQuery.error });
      return;
    }
    const { date: taskDate, employeeId, workstationId } = parsedQuery;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const requested = new Date(
      taskDate.getFullYear(),
      taskDate.getMonth(),
      taskDate.getDate(),
    );
    if (requested.getTime() === today.getTime()) {
      // "Generate on opening": idempotent job ensures recurring instances exist for today.
      await assignDailyTasksForDate(taskDate);
    }

    const teamIds = tenant.teamIds;
    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    let firstTeam = await prisma.team.findFirst({
      where: { id: { in: teamIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    // Fallback when tenant has teamIds but team row missing (e.g. data inconsistency);
    // keeps behavior aligned with today-board which does not require firstTeam to exist.
    if (!firstTeam) {
      firstTeam = {
        id: teamIds[0],
        name: "Équipe",
      };
    }

    // All members from all managed teams (for filters and display)
    const members = await prisma.user.findMany({
      where: {
        teamId: { in: teamIds },
        role: "EMPLOYEE",
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    });

    // Build filter: any managed team, optional employee filter
    const employeeFilter: Record<string, unknown> = { teamId: { in: teamIds } };
    if (employeeId) {
      const isTeamMember = members.some((m) => m.id === employeeId);
      if (isTeamMember) {
        employeeFilter.id = employeeId;
      }
    }

    // Build task filter: date + optional workstation filter
    const taskWhere: Record<string, unknown> = {
      employee: employeeFilter,
      date: {
        gte: taskDate,
        lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
      },
    };
    if (workstationId) {
      taskWhere.templateWorkstationId =
        workstationId === "__direct__" ? null : workstationId;
    }

    const dailyTaskRows = await prisma.dailyTask.findMany({
      where: taskWhere,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        taskTemplate: {
          select: {
            id: true,
            title: true,
            description: true,
            isRecurring: true,
            recurrenceType: true,
            workstation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ employee: { name: "asc" } }, { createdAt: "asc" }],
    });
    const dayEnd = new Date(taskDate.getTime() + 24 * 60 * 60 * 1000);
    const dailyTasks = dailyTaskRows.map((task) => {
      const serialized = serializeDailyTaskResponse(task);
      return {
        ...serialized,
        priorityScore: computeTaskPriorityScore(
          {
            date: task.date,
            isCompleted: task.isCompleted,
            employeeId: task.employeeId,
          },
          taskDate,
          dayEnd,
        ),
      };
    });

    // Day preparation summary: recurring templates expected today and those still unassigned.
    const recurringTemplates = await prisma.taskTemplate.findMany({
      where: {
        isRecurring: true,
        OR: [
          {
            workstation: {
              teamId: { in: teamIds },
            },
          },
          {
            assignedToEmployee: {
              role: "EMPLOYEE",
              teamId: { in: teamIds },
            },
          },
          {
            createdById: payload.userId,
            workstationId: null,
            assignedToEmployeeId: null,
          },
        ],
      },
      select: {
        id: true,
        title: true,
        recurrenceType: true,
        recurrenceDays: true,
        workstation: {
          select: {
            id: true,
            name: true,
            teamId: true,
          },
        },
        assignedToEmployee: {
          select: {
            id: true,
            name: true,
            email: true,
            teamId: true,
          },
        },
      },
    });

    const dueRecurringTemplates = recurringTemplates.filter((template) =>
      shouldTemplateAppearOnDate(
        {
          isRecurring: true,
          recurrenceType: template.recurrenceType,
          recurrenceDays: template.recurrenceDays,
        },
        taskDate,
      ),
    );
    const dueRecurringTemplateIds = dueRecurringTemplates.map(
      (template) => template.id,
    );
    const unassignedRecurringTasks =
      dueRecurringTemplateIds.length === 0
        ? []
        : await prisma.dailyTask.findMany({
            where: {
              taskTemplateId: { in: dueRecurringTemplateIds },
              status: "UNASSIGNED",
              employeeId: null,
              date: {
                gte: taskDate,
                lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
              },
            },
            select: {
              taskTemplateId: true,
            },
          });
    const unassignedTemplateIds = new Set(
      unassignedRecurringTasks.map((task) => task.taskTemplateId),
    );

    const workstationIds = recurringTemplates
      .map((template) => template.workstation?.id)
      .filter((id): id is string => !!id);

    const workstationMembers =
      workstationIds.length === 0
        ? []
        : await prisma.employeeWorkstation.findMany({
            where: {
              workstationId: { in: workstationIds },
              employee: {
                role: "EMPLOYEE",
                teamId: { in: teamIds },
              },
            },
            select: {
              workstationId: true,
              employee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: [
              { workstationId: "asc" },
              { employee: { name: "asc" } },
              { employeeId: "asc" },
            ],
          });

    const membersByWorkstation = workstationMembers.reduce<
      Record<string, Array<{ id: string; name: string; email: string }>>
    >((acc, link) => {
      if (!acc[link.workstationId]) {
        acc[link.workstationId] = [];
      }
      acc[link.workstationId].push(link.employee);
      return acc;
    }, {});

    const unassignedRecurringTemplates = dueRecurringTemplates
      .filter((template) => unassignedTemplateIds.has(template.id))
      .map((template) => {
        const workstationAllowed =
          !!template.workstation?.teamId &&
          hasTenantAccessToTeam(tenant, template.workstation.teamId);
        const employeeAllowed =
          !!template.assignedToEmployee?.teamId &&
          hasTenantAccessToTeam(tenant, template.assignedToEmployee.teamId);

        const suggestedEmployees = employeeAllowed
          ? [
              {
                id: template.assignedToEmployee!.id,
                name: template.assignedToEmployee!.name,
                email: template.assignedToEmployee!.email,
              },
            ]
          : workstationAllowed && template.workstation
            ? (membersByWorkstation[template.workstation.id] ?? [])
            : [];

        return {
          templateId: template.id,
          title: template.title,
          workstation:
            workstationAllowed && template.workstation
              ? {
                  id: template.workstation.id,
                  name: template.workstation.name,
                }
              : null,
          suggestedEmployees,
          defaultEmployeeId: suggestedEmployees[0]?.id ?? null,
        };
      });

    // Workstations from all managed teams
    const workstations = await prisma.workstation.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    // Backward compat: expose first team with aggregated members
    const team = {
      id: firstTeam.id,
      name: firstTeam.name,
      members,
    };

    const existingPreparation = await prisma.dayPreparation.findFirst({
      where: { date: taskDate },
      select: { preparedAt: true },
    });
    let preparedAt = existingPreparation?.preparedAt ?? null;
    if (unassignedRecurringTemplates.length === 0) {
      if (!preparedAt) {
        const saved = await prisma.dayPreparation.upsert({
          where: {
            managerId_date: {
              managerId: payload.userId,
              date: taskDate,
            },
          },
          create: {
            managerId: payload.userId,
            date: taskDate,
            preparedAt: new Date(),
          },
          update: {
            preparedAt: existingPreparation?.preparedAt ?? new Date(),
          },
          select: { preparedAt: true },
        });
        preparedAt = saved.preparedAt;
      }
    } else if (preparedAt) {
      await prisma.dayPreparation.upsert({
        where: {
          managerId_date: {
            managerId: payload.userId,
            date: taskDate,
          },
        },
        create: {
          managerId: payload.userId,
          date: taskDate,
          preparedAt: null,
        },
        update: {
          preparedAt: null,
        },
      });
      preparedAt = null;
    }

    res.json({
      team,
      date: taskDate,
      dailyTasks,
      workstations,
      dayPreparation: {
        recurringTemplatesTotal: dueRecurringTemplates.length,
        recurringUnassignedCount: unassignedRecurringTemplates.length,
        isPrepared: unassignedRecurringTemplates.length === 0,
        preparedAt: preparedAt ? preparedAt.toISOString() : null,
        unassignedRecurringTemplates,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};
