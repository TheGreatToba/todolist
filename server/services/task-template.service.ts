import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/db";
import { AppError } from "../lib/errors";
import { parseDateQuery } from "../lib/parse-date-query";
import {
  normalizeRecurrenceMode,
  shouldTemplateAppearOnDate,
} from "../lib/recurrence";
import { TASK_TEMPLATE_SAME_TEAM_MESSAGE } from "../lib/task-template-invariant";

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

const CreateTaskTemplateSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    workstationId: z.string().optional(),
    assignedToEmployeeId: z.string().optional(),
    isRecurring: z.boolean().default(true),
    recurrenceMode: RecurrenceModeSchema.optional(),
    recurrenceType: ScheduleRecurrenceTypeSchema.optional(),
    recurrenceDays: z.array(z.number().int().min(0).max(6)).optional(),
    recurrenceDayOfMonth: z.number().int().min(1).max(31).optional(),
    recurrenceInterval: z.number().int().min(1).optional(),
    recurrenceIntervalUnit: RecurrenceIntervalUnitSchema.optional(),
    targetPerWeek: z.number().int().min(1).max(7).optional(),
    notifyEmployee: z.boolean().default(true),
    date: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      !data.isRecurring &&
      !data.workstationId &&
      !data.assignedToEmployeeId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Either workstationId or assignedToEmployeeId must be provided for one-shot templates",
        path: ["workstationId"],
      });
    }

    if (!data.isRecurring) {
      return;
    }

    const recurrenceMode = data.recurrenceMode ?? "schedule_based";
    if (recurrenceMode === "schedule_based") {
      const recurrenceType = data.recurrenceType ?? "daily";
      if (
        recurrenceType === "monthly" &&
        data.recurrenceDayOfMonth === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "recurrenceDayOfMonth is required for monthly schedule-based templates",
          path: ["recurrenceDayOfMonth"],
        });
      }
      return;
    }

    if (recurrenceMode === "after_completion") {
      if (data.recurrenceInterval === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "recurrenceInterval is required for after_completion mode",
          path: ["recurrenceInterval"],
        });
      }
      if (data.recurrenceIntervalUnit === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "recurrenceIntervalUnit is required for after_completion mode",
          path: ["recurrenceIntervalUnit"],
        });
      }
    }
  });

type CreateTaskTemplateParsedInput = z.infer<typeof CreateTaskTemplateSchema>;

type TaskTemplateWithRelations = Prisma.TaskTemplateGetPayload<{
  include: {
    workstation: {
      select: {
        id: true;
        name: true;
      };
    };
    assignedToEmployee: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

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

function addOneDay(startOfDay: Date): Date {
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
}

function normalizeAssigneeIds(assigneeIds: string[]): string[] {
  return [...new Set(assigneeIds)];
}

function isTransactionConflictError(error: unknown): boolean {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;
  return code === "P2034";
}

function isUniqueConstraintError(error: unknown): boolean {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;
  return code === "P2002";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelayMs(attempt: number): number {
  const baseMs = 30;
  const maxMs = 300;
  const expBackoff = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, expBackoff / 3));
  return expBackoff + jitter;
}

async function validateAndResolveTeamContext(
  tx: Prisma.TransactionClient,
  input: CreateTaskTemplateParsedInput,
  managerUserId: string,
  teamIds: string[],
): Promise<void> {
  let workstationTeamId: string | null = null;
  if (input.workstationId) {
    const workstation = await tx.workstation.findFirst({
      where: {
        id: input.workstationId,
        teamId: { in: teamIds },
        team: { is: { managerId: managerUserId } },
      },
      select: { teamId: true },
    });
    if (!workstation || !workstation.teamId) {
      throw new AppError(404, "Not found");
    }
    workstationTeamId = workstation.teamId;
  }

  let employeeTeamId: string | null = null;
  if (input.assignedToEmployeeId) {
    const employee = await tx.user.findFirst({
      where: {
        id: input.assignedToEmployeeId,
        role: "EMPLOYEE",
        team: { is: { managerId: managerUserId } },
      },
      select: { teamId: true },
    });
    if (!employee || !employee.teamId) {
      throw new AppError(404, "Not found");
    }
    employeeTeamId = employee.teamId;
  }

  if (
    workstationTeamId !== null &&
    employeeTeamId !== null &&
    workstationTeamId !== employeeTeamId
  ) {
    throw new AppError(400, TASK_TEMPLATE_SAME_TEAM_MESSAGE);
  }
}

async function createDependentDailyTasks(
  tx: Prisma.TransactionClient,
  body: CreateTaskTemplateParsedInput,
  taskTemplate: TaskTemplateWithRelations,
  taskDate: Date,
): Promise<void> {
  const recurrenceMode = normalizeRecurrenceMode(taskTemplate.recurrenceMode);
  let shouldAppearToday = false;
  if (recurrenceMode === "schedule_based") {
    shouldAppearToday = shouldTemplateAppearOnDate(
      {
        isRecurring: taskTemplate.isRecurring,
        recurrenceMode: taskTemplate.recurrenceMode,
        recurrenceType: taskTemplate.recurrenceType,
        recurrenceDays: taskTemplate.recurrenceDays,
        recurrenceDayOfMonth: taskTemplate.recurrenceDayOfMonth,
      },
      taskDate,
    );
  } else if (recurrenceMode === "after_completion") {
    // First after-completion occurrence is created immediately on template creation date.
    shouldAppearToday = true;
  }

  const taskSnapshot = buildDailyTaskSnapshot(taskTemplate);
  if (!shouldAppearToday && taskTemplate.isRecurring) {
    return;
  }

  const dayEnd = addOneDay(taskDate);
  const existing = await tx.dailyTask.findFirst({
    where: {
      taskTemplateId: taskTemplate.id,
      date: {
        gte: taskDate,
        lt: dayEnd,
      },
    },
    select: { id: true },
  });

  if (!existing && taskTemplate.isRecurring) {
    await tx.dailyTask.create({
      data: {
        taskTemplateId: taskTemplate.id,
        ...taskSnapshot,
        employeeId: null,
        date: taskDate,
        status: "UNASSIGNED",
        isCompleted: false,
      },
    });
    return;
  }

  if (taskTemplate.isRecurring) {
    return;
  }

  const assigneeIds: string[] = [];
  if (body.assignedToEmployeeId) {
    assigneeIds.push(body.assignedToEmployeeId);
  } else if (body.workstationId) {
    const links = await tx.employeeWorkstation.findMany({
      where: { workstationId: body.workstationId },
      select: { employeeId: true },
    });
    assigneeIds.push(...links.map((link) => link.employeeId));
  }

  const uniqueAssigneeIds = normalizeAssigneeIds(assigneeIds);
  for (const assigneeId of uniqueAssigneeIds) {
    const existingAssigned = await tx.dailyTask.findFirst({
      where: {
        taskTemplateId: taskTemplate.id,
        employeeId: assigneeId,
        date: {
          gte: taskDate,
          lt: dayEnd,
        },
      },
      select: { id: true },
    });
    if (existingAssigned) continue;
    await tx.dailyTask.create({
      data: {
        taskTemplateId: taskTemplate.id,
        ...taskSnapshot,
        employeeId: assigneeId,
        date: taskDate,
        status: "ASSIGNED",
        isCompleted: false,
      },
    });
  }
}

export async function createTaskTemplateTransactional(input: {
  userId: string;
  body: unknown;
  db?: PrismaClient;
  teamIds?: string[];
}): Promise<TaskTemplateWithRelations> {
  const db = input.db ?? prisma;
  const body = CreateTaskTemplateSchema.parse(input.body);
  const taskDate = parseDateQuery(body.date);
  if (!taskDate) {
    throw new AppError(400, "Invalid date. Use YYYY-MM-DD.");
  }

  const maxAttempts = 3;
  let attempt = 1;
  while (true) {
    try {
      return await db.$transaction(
        async (tx) => {
          await validateAndResolveTeamContext(
            tx,
            body,
            input.userId,
            input.teamIds ?? [],
          );

          const taskTemplate = await tx.taskTemplate.create({
            data: {
              title: body.title,
              description: body.description,
              workstationId: body.workstationId || null,
              assignedToEmployeeId: body.assignedToEmployeeId || null,
              createdById: input.userId,
              isRecurring: body.isRecurring,
              recurrenceMode: body.isRecurring
                ? (body.recurrenceMode ?? "schedule_based")
                : "schedule_based",
              recurrenceType: body.recurrenceType ?? "daily",
              recurrenceDays: body.recurrenceDays?.length
                ? body.recurrenceDays.join(",")
                : null,
              recurrenceDayOfMonth:
                body.recurrenceType === "monthly"
                  ? (body.recurrenceDayOfMonth ?? null)
                  : null,
              recurrenceInterval:
                body.recurrenceMode === "after_completion"
                  ? (body.recurrenceInterval ?? null)
                  : null,
              recurrenceIntervalUnit:
                body.recurrenceMode === "after_completion"
                  ? (body.recurrenceIntervalUnit ?? null)
                  : null,
              targetPerWeek: body.targetPerWeek ?? null,
              notifyEmployee: body.notifyEmployee,
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

          await createDependentDailyTasks(tx, body, taskTemplate, taskDate);
          return taskTemplate;
        },
        {
          maxWait: 5_000,
          timeout: 15_000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      const canRetry =
        isTransactionConflictError(error) && attempt < maxAttempts;
      if (!canRetry) throw error;
      await wait(computeRetryDelayMs(attempt));
      attempt += 1;
    }
  }
}

type ManualTriggerTaskWithRelations = Prisma.DailyTaskGetPayload<{
  include: {
    employee: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    taskTemplate: {
      select: {
        id: true;
        title: true;
        description: true;
        isRecurring: true;
        recurrenceType: true;
        workstation: {
          select: {
            id: true;
            name: true;
          };
        };
      };
    };
  };
}>;

const manualTriggerTaskInclude = {
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
} satisfies Prisma.DailyTaskInclude;

export async function instantiateManualTriggerTemplateTaskTransactional(input: {
  managerUserId: string;
  templateId: string;
  dueDate: Date;
  assignedToEmployeeId?: string | null;
  db?: PrismaClient;
}): Promise<{ task: ManualTriggerTaskWithRelations; created: boolean }> {
  const db = input.db ?? prisma;
  const maxAttempts = 3;
  let attempt = 1;

  while (true) {
    try {
      return await db.$transaction(
        async (tx) => {
          const managedTeams = await tx.team.findMany({
            where: { managerId: input.managerUserId },
            select: { id: true },
          });
          const managedTeamIds = new Set(managedTeams.map((team) => team.id));

          const template = await tx.taskTemplate.findUnique({
            where: { id: input.templateId },
            include: {
              createdBy: { select: { id: true } },
              workstation: { select: { id: true, name: true, teamId: true } },
              assignedToEmployee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  teamId: true,
                },
              },
            },
          });

          if (!template) {
            throw new AppError(404, "Template not found");
          }

          const templateTeamId =
            template.workstation?.teamId ??
            template.assignedToEmployee?.teamId ??
            null;
          const canAccessUnassignedTemplate =
            templateTeamId === null &&
            template.createdBy.id === input.managerUserId;

          if (
            (templateTeamId === null && !canAccessUnassignedTemplate) ||
            (templateTeamId !== null && !managedTeamIds.has(templateTeamId))
          ) {
            throw new AppError(404, "Template not found");
          }

          if (
            normalizeRecurrenceMode(template.recurrenceMode) !==
            "manual_trigger"
          ) {
            throw new AppError(
              400,
              "Only manual_trigger templates can be instantiated with this endpoint",
            );
          }

          let targetEmployeeId: string | null = null;
          if (input.assignedToEmployeeId) {
            const employee = await tx.user.findUnique({
              where: { id: input.assignedToEmployeeId },
              select: { id: true, role: true, teamId: true },
            });
            if (
              !employee ||
              employee.role !== "EMPLOYEE" ||
              !employee.teamId ||
              !managedTeamIds.has(employee.teamId)
            ) {
              throw new AppError(404, "Employee not found");
            }
            if (templateTeamId !== null && employee.teamId !== templateTeamId) {
              throw new AppError(403, "Forbidden");
            }
            targetEmployeeId = employee.id;
          } else if (
            template.assignedToEmployee &&
            template.assignedToEmployee.role === "EMPLOYEE" &&
            template.assignedToEmployee.teamId &&
            managedTeamIds.has(template.assignedToEmployee.teamId)
          ) {
            targetEmployeeId = template.assignedToEmployee.id;
          }

          const dayEnd = addOneDay(input.dueDate);
          const taskSnapshot = buildDailyTaskSnapshot(template);
          const baseWhere = {
            taskTemplateId: template.id,
            date: {
              gte: input.dueDate,
              lt: dayEnd,
            },
          };
          const existingTask = await tx.dailyTask.findFirst({
            where: targetEmployeeId
              ? {
                  ...baseWhere,
                  employeeId: targetEmployeeId,
                }
              : {
                  ...baseWhere,
                  employeeId: null,
                  status: "UNASSIGNED",
                },
            include: manualTriggerTaskInclude,
            orderBy: { createdAt: "asc" },
          });
          if (existingTask) {
            return { task: existingTask, created: false };
          }

          const createdTask = await tx.dailyTask.create({
            data: {
              taskTemplateId: template.id,
              ...taskSnapshot,
              employeeId: targetEmployeeId,
              date: input.dueDate,
              status: targetEmployeeId ? "ASSIGNED" : "UNASSIGNED",
              isCompleted: false,
              completedAt: null,
            },
            include: manualTriggerTaskInclude,
          });
          return { task: createdTask, created: true };
        },
        {
          maxWait: 5_000,
          timeout: 15_000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      const canRetry =
        (isTransactionConflictError(error) || isUniqueConstraintError(error)) &&
        attempt < maxAttempts;
      if (!canRetry) throw error;
      await wait(computeRetryDelayMs(attempt));
      attempt += 1;
    }
  }
}
