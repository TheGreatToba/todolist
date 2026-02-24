import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/db";
import { AppError } from "../lib/errors";
import { parseDateQuery } from "../lib/parse-date-query";
import { shouldTemplateAppearOnDate } from "../lib/recurrence";
import { TASK_TEMPLATE_SAME_TEAM_MESSAGE } from "../lib/task-template-invariant";

const CreateTaskTemplateSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    workstationId: z.string().optional(),
    assignedToEmployeeId: z.string().optional(),
    isRecurring: z.boolean().default(true),
    recurrenceType: z.enum(["daily", "weekly", "x_per_week"]).optional(),
    recurrenceDays: z.array(z.number().int().min(0).max(6)).optional(),
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
): Promise<void> {
  let workstationTeamId: string | null = null;
  if (input.workstationId) {
    const workstation = await tx.workstation.findFirst({
      where: {
        id: input.workstationId,
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
  const shouldAppearToday = shouldTemplateAppearOnDate(
    {
      isRecurring: taskTemplate.isRecurring,
      recurrenceType: taskTemplate.recurrenceType,
      recurrenceDays: taskTemplate.recurrenceDays,
    },
    taskDate,
  );
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
}): Promise<TaskTemplateWithRelations> {
  const body = CreateTaskTemplateSchema.parse(input.body);
  const taskDate = parseDateQuery(body.date);
  if (!taskDate) {
    throw new AppError(400, "Invalid date. Use YYYY-MM-DD.");
  }

  const maxAttempts = 3;
  let attempt = 1;
  while (true) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await validateAndResolveTeamContext(tx, body, input.userId);

          const taskTemplate = await tx.taskTemplate.create({
            data: {
              title: body.title,
              description: body.description,
              workstationId: body.workstationId || null,
              assignedToEmployeeId: body.assignedToEmployeeId || null,
              createdById: input.userId,
              isRecurring: body.isRecurring,
              recurrenceType: body.recurrenceType ?? "daily",
              recurrenceDays: body.recurrenceDays?.length
                ? body.recurrenceDays.join(",")
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
