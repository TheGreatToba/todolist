import { RequestHandler } from 'express';
import { z } from 'zod';
import prisma from '../lib/db';
import { getIO } from '../lib/socket';
import { sendErrorResponse } from '../lib/errors';
import { getAuthOrThrow } from '../middleware/requireAuth';
import { assignDailyTasksForDate } from '../jobs/daily-task-assignment';
import { logger } from '../lib/logger';
import { getManagerTeamIds, getManagerTeams } from '../lib/manager-teams';
import { paramString } from '../lib/params';
import { parseDateQuery } from '../lib/parse-date-query';

const CreateTaskTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  workstationId: z.string().optional(),
  assignedToEmployeeId: z.string().optional(),
  isRecurring: z.boolean().default(true),
  notifyEmployee: z.boolean().default(true),
}).refine(
  (data) => data.workstationId || data.assignedToEmployeeId,
  'Either workstationId or assignedToEmployeeId must be provided'
);

const UpdateDailyTaskSchema = z.object({
  isCompleted: z.boolean(),
});

// Get all daily tasks for an employee on a specific date
export const handleGetEmployeeDailyTasks: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const taskDate = parseDateQuery(req.query.date);
    if (taskDate === null) {
      res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
      return;
    }

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
      orderBy: { createdAt: 'asc' },
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
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    const body = UpdateDailyTaskSchema.parse(req.body);

    const task = await prisma.dailyTask.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (task.employeeId !== payload.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const updatedTask = await prisma.dailyTask.update({
      where: { id: taskId },
      data: {
        isCompleted: body.isCompleted,
        completedAt: body.isCompleted ? new Date() : null,
      },
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
        const taskTemplate = (updatedTask as { taskTemplate?: { title: string } }).taskTemplate;
        const taskTitle = taskTemplate?.title ?? 'Task';
        io.to(`team:${employee.teamId}`).emit('task:updated', {
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
      if (!workstation || !workstation.teamId || !managerTeamIds.has(workstation.teamId)) {
        res.status(404).json({ error: 'Not found' });
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
        user.role !== 'EMPLOYEE' ||
        !user.teamId ||
        !managerTeamIds.has(user.teamId)
      ) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      employeeTeamId = user.teamId;
    }

    // When both are provided, they must belong to the same team (no cross-team mixed template)
    if (workstationTeamId !== null && employeeTeamId !== null && workstationTeamId !== employeeTeamId) {
      res.status(400).json({
        error: 'Workstation and employee must belong to the same team',
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

    // If recurring, create daily tasks
    if (body.isRecurring) {
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
              io.to(`user:${employeeId}`).emit('task:assigned', {
                taskId: taskTemplate.id,
                employeeId,
                employeeName: employee.name,
                taskTitle: body.title,
                taskDescription: body.description,
              });
            }

            // Send email notification (optional, using nodemailer if available)
            try {
              const { sendTaskAssignmentEmail } = await import('../lib/email');
              await sendTaskAssignmentEmail(
                employee.email,
                employee.name,
                body.title,
                body.description
              );
            } catch (emailError) {
              logger.info('Email notification skipped (email service not available)');
            }
          }
        }
      }
    }

    res.status(201).json(taskTemplate);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Cron: assign daily tasks for recurring templates (call each morning)
// CRON_SECRET is required; the endpoint is disabled if not configured.
export const handleDailyTaskAssignment: RequestHandler = async (req, res) => {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret || expectedSecret.trim() === '') {
      res.status(503).json({
        error: 'Cron endpoint is disabled. Set CRON_SECRET in your environment to enable it.',
      });
      return;
    }

    const secret = req.headers['x-cron-secret'];
    if (!secret || secret !== expectedSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const targetDate = parseDateQuery(req.query.date);
    if (targetDate === null) {
      res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
      return;
    }

    const result = await assignDailyTasksForDate(targetDate);

    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');

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
    const { date, employeeId, workstationId } = req.query;
    const taskDate = parseDateQuery(date);
    if (taskDate === null) {
      res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
      return;
    }

    const teamIds = await getManagerTeamIds(payload.userId);
    if (teamIds.length === 0) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const teams = await getManagerTeams(payload.userId);
    const firstTeam = teams[0];

    // All members from all managed teams (for filters and display)
    const members = await prisma.user.findMany({
      where: {
        teamId: { in: teamIds },
        role: 'EMPLOYEE',
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });

    // Build filter: any managed team, optional employee filter
    const employeeFilter: Record<string, unknown> = { teamId: { in: teamIds } };
    if (employeeId && typeof employeeId === 'string') {
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
    if (workstationId && typeof workstationId === 'string') {
      taskWhere.taskTemplate =
        workstationId === '__direct__' ? { workstationId: null } : { workstationId };
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
      orderBy: [{ employee: { name: 'asc' } }, { createdAt: 'asc' }],
    });

    // Workstations from all managed teams
    const workstations = await prisma.workstation.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
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
