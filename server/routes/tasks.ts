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
import {
  parseDateQueryParam,
  parseManagerDashboardQuery,
} from "../lib/query-schemas";

const CreateTaskTemplateSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    workstationId: z.string().optional(),
    assignedToEmployeeId: z.string().optional(),
    isRecurring: z.boolean().default(true),
    notifyEmployee: z.boolean().default(true),
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

const UpdateDailyTaskSchema = z
  .object({
    isCompleted: z.boolean().optional(),
    employeeId: z.string().min(1).optional(),
  })
  .refine(
    (data) => data.isCompleted !== undefined || data.employeeId !== undefined,
    "Either isCompleted or employeeId must be provided",
  );

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
      where: { id: task.employeeId },
      select: { teamId: true },
    });
    if (!taskEmployee?.teamId) {
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
    }
    if (body.employeeId !== undefined) {
      updateData.employeeId = body.employeeId;
      if (body.employeeId !== task.employeeId && task.isCompleted) {
        updateData.isCompleted = false;
        updateData.completedAt = null;
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

    // Create today's daily tasks immediately for recurring and one-shot templates.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const employees: string[] = [];

    // If assigned to specific employee, create task only for them
    if (body.assignedToEmployeeId) {
      employees.push(body.assignedToEmployeeId);
    } else if (body.workstationId) {
      // If assigned to workstation, create tasks for all employees in that workstation
      const employeeWorkstations = await prisma.employeeWorkstation.findMany({
        where: {
          workstationId: body.workstationId,
        },
        select: {
          employeeId: true,
        },
      });
      employees.push(...employeeWorkstations.map((ew) => ew.employeeId));
    }

    // Create daily tasks for each employee
    for (const employeeId of employees) {
      const existing = await prisma.dailyTask.findFirst({
        where: {
          taskTemplateId: taskTemplate.id,
          employeeId,
          date: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.dailyTask.create({
        data: {
          taskTemplateId: taskTemplate.id,
          employeeId,
          date: today,
          isCompleted: false,
        },
      });

      // Send notification if enabled
      if (body.notifyEmployee) {
        const employee = await prisma.user.findUnique({
          where: { id: employeeId },
          select: { email: true, name: true },
        });

        if (employee) {
          // Emit socket event to the assigned employee only
          const io = getIO();
          if (io) {
            io.to(`user:${employeeId}`).emit("task:assigned", {
              taskId: taskTemplate.id,
              employeeId,
              employeeName: employee.name,
              taskTitle: body.title,
              taskDescription: body.description,
            });
          }

          // Send email notification (optional, using nodemailer if available)
          try {
            await sendTaskAssignmentEmail(
              employee.email,
              employee.name,
              body.title,
              body.description,
            );
          } catch {
            logger.info(
              "Email notification skipped (email service not available)",
            );
          }
        }
      }
    }

    res.status(201).json(taskTemplate);
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

    res.json(updatedTemplate);
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

    res.json({
      team,
      date: taskDate,
      dailyTasks,
      workstations,
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};
