import { RequestHandler } from "express";
import { z } from "zod";
import prisma from "../lib/db";
import { getIO } from "../lib/socket";
import { sendErrorResponse } from "../lib/errors";
import { getAuthOrThrow } from "../middleware/requireAuth";
import { assignDailyTasksForDate } from "../jobs/daily-task-assignment";
import { logger } from "../lib/logger";
import { getManagerTeamIds, getManagerTeams } from "../lib/manager-teams";
import { paramString } from "../lib/params";
import { sendTaskAssignmentEmail } from "../lib/email";
import { parseDateQuery } from "../lib/parse-date-query";
import {
  parseDateQueryParam,
  parseManagerDashboardQuery,
} from "../lib/query-schemas";
import {
  parseRecurrenceDaysCsv,
  shouldTemplateAppearOnDate,
} from "../lib/recurrence";

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
  .refine(
    (data) => data.workstationId || data.assignedToEmployeeId,
    "Either workstationId or assignedToEmployeeId must be provided",
  );

const UpdateTaskTemplateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    workstationId: z.string().optional().nullable(),
    assignedToEmployeeId: z.string().optional().nullable(),
    isRecurring: z.boolean().optional(),
    recurrenceType: z.enum(["daily", "weekly", "x_per_week"]).optional(),
    recurrenceDays: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .nullable(),
    targetPerWeek: z.number().int().min(1).max(7).optional().nullable(),
    notifyEmployee: z.boolean().optional(),
  })
  .refine((data) => {
    // If updating assignments (at least one field is not undefined),
    // we cannot allow both to be explicitly null
    const updatingAssignments =
      data.workstationId !== undefined ||
      data.assignedToEmployeeId !== undefined;

    if (updatingAssignments) {
      // If both are explicitly set to null, that's invalid
      // (The handler will verify final state after merging with existing values)
      if (data.workstationId === null && data.assignedToEmployeeId === null) {
        return false;
      }
    }
    return true;
  }, "Either workstationId or assignedToEmployeeId must be provided");

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

function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
    ...template,
    recurrenceDays: parseRecurrenceDaysCsv(template.recurrenceDays),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

// Get all daily tasks for an employee on a specific date
export const handleGetEmployeeDailyTasks: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const query = req.query as Record<string, unknown>;
    const parsedDate = parseDateQueryParam(query.date, query);
    if ("error" in parsedDate) {
      res.status(400).json({ error: parsedDate.error });
      return;
    }
    const taskDate = parsedDate.date;

    const tasks = await prisma.dailyTask.findMany({
      where: {
        employeeId: payload.userId,
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

    res.json(tasks);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Update a daily task completion status
export const handleUpdateDailyTask: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const taskId = paramString(req.params.taskId);
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const body = UpdateDailyTaskSchema.parse(req.body);

    const task = await prisma.dailyTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const taskEmployee = await prisma.user.findUnique({
      where: { id: task.employeeId ?? "" },
      select: { teamId: true },
    });
    if (!task.employeeId || !taskEmployee?.teamId) {
      res.status(404).json({ error: "Task employee not found" });
      return;
    }

    let managerTeamIds = new Set<string>();
    let isManagerOfTaskTeam = false;
    if (payload.role === "MANAGER") {
      managerTeamIds = new Set(await getManagerTeamIds(payload.userId));
      isManagerOfTaskTeam = managerTeamIds.has(taskEmployee.teamId);
    }
    const isTaskOwner = task.employeeId === payload.userId;

    if (
      body.isCompleted !== undefined &&
      !isTaskOwner &&
      !isManagerOfTaskTeam
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (body.employeeId !== undefined) {
      if (!isManagerOfTaskTeam) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const targetEmployee = await prisma.user.findUnique({
        where: { id: body.employeeId },
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
      if (
        !managerTeamIds.has(targetEmployee.teamId) ||
        targetEmployee.teamId !== taskEmployee.teamId
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (body.employeeId !== task.employeeId) {
        const existing = await prisma.dailyTask.findFirst({
          where: {
            id: { not: task.id },
            taskTemplateId: task.taskTemplateId,
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

    const updateData: {
      isCompleted?: boolean;
      completedAt?: Date | null;
      employeeId?: string;
    } = {};
    if (body.isCompleted !== undefined) {
      updateData.isCompleted = body.isCompleted;
      updateData.completedAt = body.isCompleted ? new Date() : null;
      // Keep explicit status aligned with completion state.
      (updateData as { status?: string }).status = body.isCompleted
        ? "DONE"
        : "ASSIGNED";
    }
    if (body.employeeId !== undefined) {
      updateData.employeeId = body.employeeId;
      (updateData as { status?: string }).status = "ASSIGNED";
      if (body.employeeId !== task.employeeId && task.isCompleted) {
        updateData.isCompleted = false;
        updateData.completedAt = null;
        (updateData as { status?: string }).status = "ASSIGNED";
      }
    }

    const updatedTask = await prisma.dailyTask.update({
      where: { id: taskId },
      data: updateData,
      include: {
        taskTemplate: {
          select: {
            id: true,
            title: true,
            description: true,
            isRecurring: true,
          },
        },
      },
    });

    // Emit socket.io event to notify manager (team room only)
    const io = getIO();
    if (io) {
      const employee = await prisma.user.findUnique({
        where: { id: updatedTask.employeeId },
        select: { teamId: true },
      });
      if (employee?.teamId) {
        const taskTemplate = (
          updatedTask as { taskTemplate?: { title: string } }
        ).taskTemplate;
        const taskTitle = taskTemplate?.title ?? "Task";
        io.to(`team:${employee.teamId}`).emit("task:updated", {
          taskId: updatedTask.id,
          employeeId: updatedTask.employeeId,
          isCompleted: updatedTask.isCompleted,
          taskTitle,
        });
      }
    }

    res.json(updatedTask);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Create a task template (manager only)
export const handleCreateTaskTemplate: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const body = CreateTaskTemplateSchema.parse(req.body);

    // Load managed team IDs once for authz checks (Set for O(1) .has() when many teams)
    const managerTeamIds = new Set(await getManagerTeamIds(payload.userId));

    let workstationTeamId: string | null = null;
    if (body.workstationId) {
      const workstation = await prisma.workstation.findUnique({
        where: { id: body.workstationId },
        select: { teamId: true },
      });
      if (
        !workstation ||
        !workstation.teamId ||
        !managerTeamIds.has(workstation.teamId)
      ) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      workstationTeamId = workstation.teamId;
    }

    let employeeTeamId: string | null = null;
    if (body.assignedToEmployeeId) {
      const user = await prisma.user.findUnique({
        where: { id: body.assignedToEmployeeId },
        select: { teamId: true, role: true },
      });
      if (
        !user ||
        user.role !== "EMPLOYEE" ||
        !user.teamId ||
        !managerTeamIds.has(user.teamId)
      ) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      employeeTeamId = user.teamId;
    }

    // When both are provided, they must belong to the same team (no cross-team mixed template)
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

    const taskTemplate = await prisma.taskTemplate.create({
      data: {
        title: body.title,
        description: body.description,
        workstationId: body.workstationId || null,
        assignedToEmployeeId: body.assignedToEmployeeId || null,
        createdById: payload.userId,
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

    // Create today's daily task immediately.
    const taskDate = parseDateQuery(body.date);
    if (!taskDate) {
      res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD." });
      return;
    }
    const shouldAppearToday = shouldTemplateAppearOnDate(
      {
        isRecurring: taskTemplate.isRecurring,
        recurrenceType: taskTemplate.recurrenceType,
        recurrenceDays: taskTemplate.recurrenceDays,
      },
      taskDate,
    );
    if (shouldAppearToday || !taskTemplate.isRecurring) {
      const existing = await prisma.dailyTask.findFirst({
        where: {
          taskTemplateId: taskTemplate.id,
          date: {
            gte: taskDate,
            lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
          },
          status: "UNASSIGNED",
          employeeId: null,
        },
        select: { id: true },
      });

      if (!existing && taskTemplate.isRecurring) {
        await prisma.dailyTask.create({
          data: {
            taskTemplateId: taskTemplate.id,
            employeeId: null,
            date: taskDate,
            status: "UNASSIGNED",
            isCompleted: false,
          },
        });
      } else if (!taskTemplate.isRecurring) {
        const assigneeIds: string[] = [];
        if (body.assignedToEmployeeId) {
          assigneeIds.push(body.assignedToEmployeeId);
        } else if (body.workstationId) {
          const links = await prisma.employeeWorkstation.findMany({
            where: { workstationId: body.workstationId },
            select: { employeeId: true },
          });
          assigneeIds.push(...links.map((link) => link.employeeId));
        }

        for (const assigneeId of assigneeIds) {
          const existingAssigned = await prisma.dailyTask.findFirst({
            where: {
              taskTemplateId: taskTemplate.id,
              employeeId: assigneeId,
              date: {
                gte: taskDate,
                lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
              },
            },
            select: { id: true },
          });
          if (existingAssigned) continue;
          await prisma.dailyTask.create({
            data: {
              taskTemplateId: taskTemplate.id,
              employeeId: assigneeId,
              date: taskDate,
              status: "ASSIGNED",
              isCompleted: false,
            },
          });
        }
      }
    }

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
    const body = AssignTaskFromTemplateSchema.parse(req.body);

    const managerTeamIds = new Set(await getManagerTeamIds(payload.userId));
    const template = await prisma.taskTemplate.findUnique({
      where: { id: body.templateId },
      include: {
        workstation: { select: { id: true, teamId: true } },
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
    if (!templateTeamId || !managerTeamIds.has(templateTeamId)) {
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
        !managerTeamIds.has(employee.teamId)
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
        !managerTeamIds.has(workstation.teamId)
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

// Get all task templates for a manager (manager only)
export const handleGetTaskTemplates: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;

    const managerTeamIds = await getManagerTeamIds(payload.userId);
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

    // Combine and deduplicate, ensuring all belong to managed teams
    // Also filter out cross-team relationships (e.g., template with workstation in managed team
    // but assignedToEmployee in another team should not expose that employee)
    const templateMap = new Map<string, (typeof templatesWithWorkstation)[0]>();

    for (const template of templatesWithWorkstation) {
      // Verify workstation belongs to managed team
      if (
        template.workstation?.teamId &&
        managerTeamIds.includes(template.workstation.teamId)
      ) {
        // If template has assignedToEmployee, verify it also belongs to managed team
        // Otherwise, don't expose the cross-team relationship
        if (template.assignedToEmployee) {
          if (
            template.assignedToEmployee.teamId &&
            managerTeamIds.includes(template.assignedToEmployee.teamId)
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
        managerTeamIds.includes(template.assignedToEmployee.teamId)
      ) {
        // If template already exists in map (from workstation query), skip if it's the same
        if (!templateMap.has(template.id)) {
          // If template has workstation, verify it also belongs to managed team
          if (template.workstation) {
            if (
              template.workstation.teamId &&
              managerTeamIds.includes(template.workstation.teamId)
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

    // Remove workstation/employee teamId from response (internal only).
    // Never expose cross-team IDs: when a relation is nullified (unmanaged team),
    // also nullify the corresponding id field so no cross-team metadata is leaked.
    const templates = Array.from(templateMap.values())
      .map((t) => {
        const workstationOk =
          t.workstation &&
          t.workstation.teamId &&
          managerTeamIds.includes(t.workstation.teamId);
        const employeeOk =
          t.assignedToEmployee &&
          t.assignedToEmployee.teamId &&
          managerTeamIds.includes(t.assignedToEmployee.teamId);
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

// Update a task template (manager only)
export const handleUpdateTaskTemplate: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
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

    const managerTeamIds = new Set(await getManagerTeamIds(payload.userId));

    // Check if template belongs to a managed team
    const templateTeamId =
      existingTemplate.workstation?.teamId ||
      existingTemplate.assignedToEmployee?.teamId;

    if (!templateTeamId || !managerTeamIds.has(templateTeamId)) {
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
          !managerTeamIds.has(workstation.teamId)
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
          !managerTeamIds.has(user.teamId)
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

    // Final validation: after resolving all values, at least one assignment must be non-null
    if (workstationTeamId === null && employeeTeamId === null) {
      res.status(400).json({
        error: "Either workstationId or assignedToEmployeeId must be provided",
      });
      return;
    }

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
    const templateId = paramString(req.params.templateId);
    if (!templateId) {
      res.status(400).json({ error: "Invalid template ID" });
      return;
    }

    // Verify the template exists and belongs to a managed team
    const template = await prisma.taskTemplate.findUnique({
      where: { id: templateId },
      include: {
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

    const managerTeamIds = new Set(await getManagerTeamIds(payload.userId));

    const templateTeamId =
      template.workstation?.teamId || template.assignedToEmployee?.teamId;

    if (!templateTeamId || !managerTeamIds.has(templateTeamId)) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Delete the template (cascade will handle daily tasks)
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

// Get dashboard data for manager (all managed teams; multi-team supported)
export const handleGetManagerDashboard: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
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

    const teamIds = await getManagerTeamIds(payload.userId);
    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const teams = await getManagerTeams(payload.userId);
    const firstTeam = teams[0];

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
      taskWhere.taskTemplate =
        workstationId === "__direct__"
          ? { workstationId: null }
          : { workstationId };
    }

    const dailyTasks = await prisma.dailyTask.findMany({
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
          teamIds.includes(template.workstation.teamId);
        const employeeAllowed =
          !!template.assignedToEmployee?.teamId &&
          teamIds.includes(template.assignedToEmployee.teamId);

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

    const existingPreparation = await prisma.dayPreparation.findUnique({
      where: {
        managerId_date: {
          managerId: payload.userId,
          date: taskDate,
        },
      },
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
