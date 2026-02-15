import crypto from 'crypto';
import { RequestHandler } from 'express';
import { z } from 'zod';
import prisma from '../lib/db';
import { verifyToken, extractToken, hashPassword } from '../lib/auth';
import { sendSetPasswordEmail } from '../lib/email';

// Configurable via env; 24h default, clamped 1–168h (1 week max)
function getSetPasswordTokenExpiryHours(): number {
  const raw = parseInt(process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS || '24', 10);
  if (!Number.isFinite(raw) || raw < 1) return 24;
  return Math.min(raw, 168);
}

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
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can access this' });
      return;
    }

    const team = await prisma.team.findFirst({
      where: { managerId: payload.userId },
    });

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Return workstations: used by the manager's team OR unassigned (for assignment when creating employees)
    const workstations = await prisma.workstation.findMany({
      where: {
        OR: [
          { employees: { some: { employee: { teamId: team.id } } } },
          { employees: { none: {} } },
        ],
      },
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
    console.error('Get workstations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new workstation
export const handleCreateWorkstation: RequestHandler = async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can create workstations' });
      return;
    }

    const body = CreateWorkstationSchema.parse(req.body);

    // Check if workstation already exists
    const existing = await prisma.workstation.findUnique({
      where: { name: body.name },
    });

    if (existing) {
      res.status(400).json({ error: 'Workstation already exists' });
      return;
    }

    const workstation = await prisma.workstation.create({
      data: { name: body.name },
    });

    res.status(201).json(workstation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create workstation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new employee (manager only)
export const handleCreateEmployee: RequestHandler = async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can create employees' });
      return;
    }

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

    // Verify that all workstations exist and are in the manager's scope:
    // - Used by at least one employee of the manager's team, OR
    // - Unassigned (no employees) - allows bootstrap when creating first team member
    const requestedWorkstations = await prisma.workstation.findMany({
      where: { id: { in: body.workstationIds } },
      include: {
        employees: { include: { employee: { select: { teamId: true } } } },
      },
    });

    if (requestedWorkstations.length !== body.workstationIds.length) {
      res.status(400).json({ error: 'One or more workstations not found' });
      return;
    }

    const allowed = requestedWorkstations.every((ws) => {
      if (ws.employees.length === 0) return true; // Unassigned - ok for bootstrap
      return ws.employees.some((e) => e.employee.teamId === team.id);
    });

    if (!allowed) {
      res.status(403).json({
        error:
          'One or more workstations are exclusively used by other teams. You can only assign workstations used by your team or unassigned workstations.',
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
      console.warn('Failed to send email, but employee was created:', emailResult.error);
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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create employee error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete a workstation
export const handleDeleteWorkstation: RequestHandler = async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can delete workstations' });
      return;
    }

    const workstationId = paramString(req.params.workstationId);
    if (!workstationId) {
      res.status(400).json({ error: 'Invalid workstation ID' });
      return;
    }

    // Check if workstation has employees
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
    console.error('Delete workstation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get team members with their workstations
export const handleGetTeamMembers: RequestHandler = async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can access this' });
      return;
    }

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
    console.error('Get team members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update employee workstation assignments
export const handleUpdateEmployeeWorkstations: RequestHandler = async (req, res) => {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'MANAGER') {
      res.status(403).json({ error: 'Only managers can update employee assignments' });
      return;
    }

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

    // Verify all workstations exist and are in manager's scope (team-used or unassigned)
    const requestedWorkstations = await prisma.workstation.findMany({
      where: { id: { in: body.workstationIds } },
      include: {
        employees: { include: { employee: { select: { teamId: true } } } },
      },
    });

    if (requestedWorkstations.length !== body.workstationIds.length) {
      res.status(400).json({ error: 'One or more workstations not found' });
      return;
    }

    const allowed = requestedWorkstations.every((ws) => {
      if (ws.employees.length === 0) return true;
      return ws.employees.some((e) => e.employee.teamId === managerTeam.id);
    });

    if (!allowed) {
      res.status(403).json({
        error:
          'One or more workstations are exclusively used by other teams. You can only assign workstations used by your team or unassigned workstations.',
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
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update employee workstations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
