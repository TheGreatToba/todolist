import crypto from 'crypto';
import { RequestHandler } from 'express';
import { z } from 'zod';
import prisma from '../lib/db';
import { hashPassword } from '../lib/auth';
import { sendErrorResponse } from '../lib/errors';
import { logger } from '../lib/logger';
import { getAuthOrThrow } from '../middleware/requireAuth';
import { sendSetPasswordEmail } from '../lib/email';
import { getSetPasswordTokenExpiryHours } from '../lib/set-password-expiry';

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const CreateWorkstationSchema = z.object({
  name: z.string().min(1),
});

const CreateEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  workstationIds: z.array(z.string()).min(1),
});

const UpdateEmployeeWorkstationsSchema = z.object({
  workstationIds: z.array(z.string()),
});

function paramString(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return null;
}

// Get all workstations used by the manager's team (filtered by team scope)
export const handleGetWorkstations: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const team = await prisma.team.findFirst({
      where: { managerId: payload.userId },
    });

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Return workstations belonging to this team (name is unique per team)
    const workstations = await prisma.workstation.findMany({
      where: { teamId: team.id },
      include: {
        employees: {
          where: { employee: { teamId: team.id } },
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(workstations);
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// Create a new workstation (scoped to manager's team; name unique per team)
export const handleCreateWorkstation: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const body = CreateWorkstationSchema.parse(req.body);

    const team = await prisma.team.findFirst({
      where: { managerId: payload.userId },
    });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Name unique per team: two managers can have a workstation with the same name
    const existing = await prisma.workstation.findFirst({
      where: { teamId: team.id, name: body.name },
    });
    if (existing) {
      res.status(400).json({ error: 'A workstation with this name already exists in your team' });
      return;
    }

    const workstation = await prisma.workstation.create({
      data: { name: body.name, teamId: team.id },
    });

    res.status(201).json(workstation);
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// Create a new employee (manager only)
export const handleCreateEmployee: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const body = CreateEmployeeSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    // Get the manager's team
    const team = await prisma.team.findFirst({
      where: { managerId: payload.userId },
    });

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Verify that all workstations exist and belong to the manager's team
    const requestedWorkstations = await prisma.workstation.findMany({
      where: { id: { in: body.workstationIds } },
    });

    if (requestedWorkstations.length !== body.workstationIds.length) {
      res.status(400).json({ error: 'One or more workstations not found' });
      return;
    }

    const allowed = requestedWorkstations.every((ws) => ws.teamId === team.id);
    if (!allowed) {
      res.status(403).json({
        error: 'One or more workstations do not belong to your team.',
      });
      return;
    }

    const workstations = requestedWorkstations;

    // Placeholder password - user will set real password via email link
    const placeholderPassword = crypto.randomBytes(24).toString('hex');
    const passwordHash = await hashPassword(placeholderPassword);

    const setPasswordToken = generateSecureToken();
    const expiryHours = getSetPasswordTokenExpiryHours();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // Create employee with workstations and set-password token
    const employee = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role: 'EMPLOYEE',
        teamId: team.id,
        workstations: {
          create: body.workstationIds.map((wsId) => ({
            workstationId: wsId,
          })),
        },
        setPasswordToken: {
          create: {
            token: setPasswordToken,
            expiresAt,
          },
        },
      },
      include: {
        workstations: {
          include: {
            workstation: {
              select: { name: true },
            },
          },
        },
      },
    });

    // Create daily tasks for this employee for today (from existing templates)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const wsId of body.workstationIds) {
      const taskTemplates = await prisma.taskTemplate.findMany({
        where: { workstationId: wsId },
      });

      for (const template of taskTemplates) {
        await prisma.dailyTask.create({
          data: {
            taskTemplateId: template.id,
            employeeId: employee.id,
            date: today,
            isCompleted: false,
          },
        });
      }
    }

    // Send email with set-password link (no password in email)
    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    const setPasswordLink = `${baseUrl.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(setPasswordToken)}`;
    const workstationNames = workstations.map((ws) => ws.name);
    const emailResult = await sendSetPasswordEmail(
      body.email,
      body.name,
      setPasswordLink,
      workstationNames,
      expiryHours
    );

    if (!emailResult.success) {
      logger.warn('Failed to send email, but employee was created:', emailResult.error);
    }

    res.status(201).json({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      workstations: employee.workstations.map((ew) => ({
        id: ew.workstationId,
        name: ew.workstation.name,
      })),
      emailSent: emailResult.success,
    });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// Delete a workstation
export const handleDeleteWorkstation: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const workstationId = paramString(req.params.workstationId);
    if (!workstationId) {
      res.status(400).json({ error: 'Invalid workstation ID' });
      return;
    }

    const team = await prisma.team.findFirst({
      where: { managerId: payload.userId },
    });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const workstation = await prisma.workstation.findUnique({
      where: { id: workstationId },
    });
    if (!workstation || workstation.teamId !== team.id) {
      res.status(404).json({ error: 'Workstation not found' });
      return;
    }

    const employeeCount = await prisma.employeeWorkstation.count({
      where: { workstationId },
    });
    if (employeeCount > 0) {
      res.status(400).json({ error: 'Cannot delete workstation with employees' });
      return;
    }

    await prisma.workstation.delete({
      where: { id: workstationId },
    });

    res.json({ success: true });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// Get team members with their workstations
export const handleGetTeamMembers: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const team = await prisma.team.findFirst({
      where: { managerId: payload.userId },
      include: {
        members: {
          where: { role: 'EMPLOYEE' },
          include: {
            workstations: {
              include: {
                workstation: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Transform the data for easier frontend consumption
    const members = team.members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      workstations: member.workstations.map((ew) => ({
        id: ew.workstationId,
        name: ew.workstation.name,
      })),
    }));

    res.json(members);
  } catch (error) {
    sendErrorResponse(res, error);
  }
};

// Update employee workstation assignments
export const handleUpdateEmployeeWorkstations: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const employeeId = paramString(req.params.employeeId);
    if (!employeeId) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }

    const body = UpdateEmployeeWorkstationsSchema.parse(req.body);

    // Verify employee exists and belongs to manager's team
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      include: { team: true },
    });

    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Verify manager owns this employee's team
    const managerTeam = await prisma.team.findFirst({
      where: { managerId: payload.userId },
    });

    if (!managerTeam || employee.teamId !== managerTeam.id) {
      res.status(403).json({ error: 'You do not have permission to update this employee' });
      return;
    }

    // Verify all workstations exist and belong to the manager's team
    const requestedWorkstations = await prisma.workstation.findMany({
      where: { id: { in: body.workstationIds } },
    });

    if (requestedWorkstations.length !== body.workstationIds.length) {
      res.status(400).json({ error: 'One or more workstations not found' });
      return;
    }

    const allowed = requestedWorkstations.every((ws) => ws.teamId === managerTeam.id);
    if (!allowed) {
      res.status(403).json({
        error: 'One or more workstations do not belong to your team.',
      });
      return;
    }

    // Delete existing assignments
    await prisma.employeeWorkstation.deleteMany({
      where: { employeeId },
    });

    // Create new assignments
    if (body.workstationIds.length > 0) {
      await prisma.employeeWorkstation.createMany({
        data: body.workstationIds.map((wsId) => ({
          employeeId,
          workstationId: wsId,
        })),
      });
    }

    // Return updated employee
    const updatedEmployee = await prisma.user.findUnique({
      where: { id: employeeId },
      include: {
        workstations: {
          include: {
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

    const workstations =
      updatedEmployee && 'workstations' in updatedEmployee && Array.isArray(updatedEmployee.workstations)
        ? updatedEmployee.workstations.map((ew: { workstationId: string; workstation: { name: string } }) => ({
            id: ew.workstationId,
            name: ew.workstation.name,
          }))
        : [];

    res.json({
      id: updatedEmployee?.id,
      name: updatedEmployee?.name,
      email: updatedEmployee?.email,
      workstations,
    });
  } catch (error) {
    sendErrorResponse(res, error);
  }
};
