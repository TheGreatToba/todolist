import { RequestHandler } from 'express';
import { z } from 'zod';
import prisma from '../lib/db';
import { verifyToken, extractTokenFromHeader } from '../lib/auth';
import { assignDailyTasksForDate } from '../jobs/daily-task-assignment';

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
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const { date } = req.query;
    const taskDate = date ? new Date(date as string) : new Date();
    taskDate.setHours(0, 0, 0, 0);

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
    console.error('Get daily tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a daily task completion status
export const handleUpdateDailyTask: RequestHandler = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const { taskId } = req.params;
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

    // Emit socket.io event to notify managers
    const app = (global as any).app;
    if (app?.io) {
      app.io.emit('task:updated', {
        taskId: updatedTask.id,
        employeeId: updatedTask.employeeId,
        isCompleted: updatedTask.isCompleted,
        taskTitle: updatedTask.taskTemplate.title,
      });
    }

    res.json(updatedTask);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a task template (manager only)
export const handleCreateTaskTemplate: RequestHandler = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    if (payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can create task templates' });
      return;
    }

    const body = CreateTaskTemplateSchema.parse(req.body);

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
            // Emit socket event for real-time notification
            const app = (global as any).app;
            if (app?.io) {
              app.io.emit('task:assigned', {
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
              console.log('Email notification skipped (email service not available)');
            }
          }
        }
      }
    }

    res.status(201).json(taskTemplate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create task template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Cron: assign daily tasks for recurring templates (call each morning)
export const handleDailyTaskAssignment: RequestHandler = async (req, res) => {
  try {
    const secret = req.headers['x-cron-secret'] || req.query.secret;
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const dateParam = req.query.date as string | undefined;
    const targetDate = dateParam ? new Date(dateParam) : new Date();

    const result = await assignDailyTasksForDate(targetDate);

    res.json({
      success: true,
      date: targetDate.toISOString().split('T')[0],
      ...result,
    });
  } catch (error) {
    console.error('Daily task assignment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get dashboard data for manager
export const handleGetManagerDashboard: RequestHandler = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    if (payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can view dashboard' });
      return;
    }

    const { date, employeeId } = req.query;
    const taskDate = date ? new Date(date as string) : new Date();
    taskDate.setHours(0, 0, 0, 0);

    // Get manager's team
    const team = await prisma.team.findFirst({
      where: { managerId: payload.userId },
      include: {
        members: {
          where: { role: 'EMPLOYEE' },
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Build filter: team members only, optional employee filter
    const employeeFilter: Record<string, unknown> = { teamId: team.id };
    if (employeeId && typeof employeeId === 'string') {
      const isTeamMember = team.members.some((m) => m.id === employeeId);
      if (isTeamMember) {
        employeeFilter.id = employeeId;
      }
    }

    // Get all daily tasks for the team on the date
    const dailyTasks = await prisma.dailyTask.findMany({
      where: {
        employee: employeeFilter,
        date: {
          gte: taskDate,
          lt: new Date(taskDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
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

    // Get workstations
    const workstations = await prisma.workstation.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    res.json({
      team,
      date: taskDate,
      dailyTasks,
      workstations,
    });
  } catch (error) {
    console.error('Get manager dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
