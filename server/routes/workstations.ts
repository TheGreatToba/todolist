import crypto from "crypto";
import { RequestHandler } from "express";
import { z } from "zod";
import prisma from "../lib/db";
import { hashPassword } from "../lib/auth";
import { sendErrorResponse } from "../lib/errors";
import { logger } from "../lib/logger";
import { getAuthOrThrow } from "../middleware/requireAuth";
import { sendSetPasswordEmail } from "../lib/email";
import { getSetPasswordTokenExpiryHours } from "../lib/set-password-expiry";
import {
  getManagerTeamIds,
  getManagerFirstTeam,
  isTeamManagedBy,
} from "../lib/manager-teams";
import { paramString } from "../lib/params";

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const CreateWorkstationSchema = z.object({
  name: z.string().min(1),
  teamId: z.string().optional(),
});

const CreateEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  workstationIds: z
    .array(z.string())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "workstationIds must not contain duplicates",
    }),
});

const UpdateEmployeeWorkstationsSchema = z.object({
  workstationIds: z
    .array(z.string())
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "workstationIds must not contain duplicates",
    }),
});

const UpdateWorkstationEmployeesSchema = z.object({
  employeeIds: z
    .array(z.string())
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "employeeIds must not contain duplicates",
    }),
});

// Get all workstations used by the manager's teams (all managed teams)
export const handleGetWorkstations: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const teamIds = await getManagerTeamIds(payload.userId);

    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const workstations = await prisma.workstation.findMany({
      where: { teamId: { in: teamIds } },
      include: {
        employees: {
          where: { employee: { teamId: { in: teamIds } } },
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
      orderBy: { name: "asc" },
    });

    res.json(workstations);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Create a new workstation (scoped to a managed team; name unique per team).
// Optional teamId: when manager has multiple teams, specify which team. Otherwise first team is used.
export const handleCreateWorkstation: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const body = CreateWorkstationSchema.parse(req.body);

    let team: Awaited<ReturnType<typeof getManagerFirstTeam>>;
    if (body.teamId) {
      const allowed = await isTeamManagedBy(body.teamId, payload.userId);
      if (!allowed) {
        res
          .status(403)
          .json({ error: "Team not found or you do not manage this team." });
        return;
      }
      team = await prisma.team.findUnique({ where: { id: body.teamId } });
    } else {
      team = await getManagerFirstTeam(payload.userId);
    }
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    // Name unique per team: two managers can have a workstation with the same name
    const existing = await prisma.workstation.findFirst({
      where: { teamId: team.id, name: body.name },
    });
    if (existing) {
      res.status(400).json({
        error: "A workstation with this name already exists in your team",
      });
      return;
    }

    const workstation = await prisma.workstation.create({
      data: { name: body.name, teamId: team.id },
    });

    res.status(201).json(workstation);
  } catch (error) {
    sendErrorResponse(res, error, req);
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
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    const teamIds = await getManagerTeamIds(payload.userId);
    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const requestedWorkstations = await prisma.workstation.findMany({
      where: { id: { in: body.workstationIds } },
    });

    if (requestedWorkstations.length !== body.workstationIds.length) {
      res.status(400).json({ error: "One or more workstations not found" });
      return;
    }

    const allowed = requestedWorkstations.every(
      (ws) => ws.teamId && teamIds.includes(ws.teamId),
    );
    if (!allowed) {
      res.status(403).json({
        error: "One or more workstations do not belong to your team(s).",
      });
      return;
    }

    // Business rule: employee is assigned to one team; all workstations must belong to that same team.
    const workstationTeamIds = [
      ...new Set(requestedWorkstations.map((ws) => ws.teamId).filter(Boolean)),
    ] as string[];
    if (workstationTeamIds.length === 0) {
      res.status(400).json({
        error:
          "Selected workstations have no team. Please choose valid workstations.",
      });
      return;
    }
    if (workstationTeamIds.length > 1) {
      res.status(400).json({
        error:
          "All workstations must belong to the same team. Please select workstations from a single team.",
      });
      return;
    }
    const employeeTeamId = workstationTeamIds[0];

    const workstations = requestedWorkstations;

    // Placeholder password - user will set real password via email link
    const placeholderPassword = crypto.randomBytes(24).toString("hex");
    const passwordHash = await hashPassword(placeholderPassword);

    const setPasswordToken = generateSecureToken();
    const expiryHours = getSetPasswordTokenExpiryHours();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    // Create employee and initial daily tasks in a single transaction to avoid partial writes.
    const { employee } = await prisma.$transaction(async (tx) => {
      // Create employee in the same team as the selected workstations
      const employee = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash,
          role: "EMPLOYEE",
          teamId: employeeTeamId,
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

      // Create daily tasks for this employee for today (from workstation-scoped templates only).
      // Templates with assignedToEmployeeId are not applied here: they target a specific user
      // and are created by the daily job or when the manager assigns a task to an existing employee.
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const taskTemplates = await tx.taskTemplate.findMany({
        where: { workstationId: { in: body.workstationIds } },
      });

      if (taskTemplates.length > 0) {
        await tx.dailyTask.createMany({
          data: taskTemplates.map((template) => ({
            taskTemplateId: template.id,
            employeeId: employee.id,
            date: today,
            isCompleted: false,
          })),
        });
      }

      return { employee };
    });

    // Send email with set-password link (no password in email)
    const baseUrl = process.env.APP_URL || "http://localhost:8080";
    const setPasswordLink = `${baseUrl.replace(/\/$/, "")}/set-password?token=${encodeURIComponent(setPasswordToken)}`;
    const workstationNames = workstations.map((ws) => ws.name);
    const emailResult = await sendSetPasswordEmail(
      body.email,
      body.name,
      setPasswordLink,
      workstationNames,
      expiryHours,
    );

    if (!emailResult.success) {
      logger.warn(
        "Failed to send email, but employee was created:",
        emailResult.error,
      );
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
    sendErrorResponse(res, error, req);
  }
};

// Delete a workstation
export const handleDeleteWorkstation: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const workstationId = paramString(req.params.workstationId);
    if (!workstationId) {
      res.status(400).json({ error: "Invalid workstation ID" });
      return;
    }

    const teamIds = await getManagerTeamIds(payload.userId);
    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const workstation = await prisma.workstation.findUnique({
      where: { id: workstationId },
    });
    if (
      !workstation ||
      !workstation.teamId ||
      !teamIds.includes(workstation.teamId)
    ) {
      res.status(404).json({ error: "Workstation not found" });
      return;
    }

    const employeeCount = await prisma.employeeWorkstation.count({
      where: { workstationId },
    });
    if (employeeCount > 0) {
      res
        .status(400)
        .json({ error: "Cannot delete workstation with employees" });
      return;
    }

    await prisma.workstation.delete({
      where: { id: workstationId },
    });

    res.json({ success: true });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

// Get team members (from all managed teams) with their workstations
export const handleGetTeamMembers: RequestHandler = async (req, res) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const teamIds = await getManagerTeamIds(payload.userId);

    if (teamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const membersData = await prisma.user.findMany({
      where: {
        teamId: { in: teamIds },
        role: "EMPLOYEE",
      },
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
      orderBy: { name: "asc" },
    });

    const members = membersData.map((member) => ({
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
    sendErrorResponse(res, error, req);
  }
};

// Update employee workstation assignments
export const handleUpdateEmployeeWorkstations: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const employeeId = paramString(req.params.employeeId);
    if (!employeeId) {
      res.status(400).json({ error: "Invalid employee ID" });
      return;
    }

    const body = UpdateEmployeeWorkstationsSchema.parse(req.body);

    // Verify employee exists and belongs to manager's team
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      include: { team: true },
    });

    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    if (!employee.teamId) {
      res
        .status(403)
        .json({ error: "You do not have permission to update this employee" });
      return;
    }

    const isManaged = await isTeamManagedBy(employee.teamId, payload.userId);
    if (!isManaged) {
      res
        .status(403)
        .json({ error: "You do not have permission to update this employee" });
      return;
    }

    const requestedWorkstations = await prisma.workstation.findMany({
      where: { id: { in: body.workstationIds } },
    });

    if (requestedWorkstations.length !== body.workstationIds.length) {
      res.status(400).json({ error: "One or more workstations not found" });
      return;
    }

    const managerTeamIds = await getManagerTeamIds(payload.userId);
    const allowed = requestedWorkstations.every(
      (ws) => ws.teamId && managerTeamIds.includes(ws.teamId),
    );
    if (!allowed) {
      res.status(403).json({
        error: "One or more workstations do not belong to your team.",
      });
      return;
    }

    // Update assignments and return updated employee in a single transaction to avoid partial writes.
    const updatedEmployee = await prisma.$transaction(async (tx) => {
      // Delete existing assignments
      await tx.employeeWorkstation.deleteMany({
        where: { employeeId },
      });

      // Create new assignments
      if (body.workstationIds.length > 0) {
        await tx.employeeWorkstation.createMany({
          data: body.workstationIds.map((wsId) => ({
            employeeId,
            workstationId: wsId,
          })),
        });
      }

      // Return updated employee with fresh workstation relations
      return tx.user.findUnique({
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
    });

    // Guard: employee may have been deleted between initial check and end of transaction (concurrent request).
    if (!updatedEmployee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    const workstations =
      "workstations" in updatedEmployee &&
      Array.isArray(updatedEmployee.workstations)
        ? updatedEmployee.workstations.map(
            (ew: { workstationId: string; workstation: { name: string } }) => ({
              id: ew.workstationId,
              name: ew.workstation.name,
            }),
          )
        : [];

    res.json({
      id: updatedEmployee.id,
      name: updatedEmployee.name,
      email: updatedEmployee.email,
      workstations,
    });
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};

export const handleUpdateWorkstationEmployees: RequestHandler = async (
  req,
  res,
) => {
  try {
    const payload = getAuthOrThrow(req, res);
    if (!payload) return;
    const workstationId = paramString(req.params.workstationId);
    if (!workstationId) {
      res.status(400).json({ error: "Invalid workstation ID" });
      return;
    }

    const body = UpdateWorkstationEmployeesSchema.parse(req.body);
    const managerTeamIds = await getManagerTeamIds(payload.userId);
    if (managerTeamIds.length === 0) {
      res.status(404).json({ error: "Team not found" });
      return;
    }

    const workstation = await prisma.workstation.findUnique({
      where: { id: workstationId },
      select: { id: true, teamId: true },
    });

    if (
      !workstation ||
      !workstation.teamId ||
      !managerTeamIds.includes(workstation.teamId)
    ) {
      res.status(404).json({ error: "Workstation not found" });
      return;
    }

    const employees = await prisma.user.findMany({
      where: { id: { in: body.employeeIds } },
      select: { id: true, role: true, teamId: true },
    });

    if (employees.length !== body.employeeIds.length) {
      res.status(400).json({ error: "One or more employees not found" });
      return;
    }

    const validEmployees = employees.every(
      (employee) =>
        employee.role === "EMPLOYEE" &&
        employee.teamId === workstation.teamId &&
        employee.teamId !== null &&
        managerTeamIds.includes(employee.teamId),
    );
    if (!validEmployees) {
      res.status(403).json({
        error: "One or more employees do not belong to your managed team.",
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.employeeWorkstation.deleteMany({
        where: { workstationId },
      });

      if (body.employeeIds.length > 0) {
        await tx.employeeWorkstation.createMany({
          data: body.employeeIds.map((employeeId) => ({
            workstationId,
            employeeId,
          })),
        });
      }
    });

    const updatedWorkstation = await prisma.workstation.findUnique({
      where: { id: workstationId },
      include: {
        employees: {
          where: { employee: { teamId: workstation.teamId } },
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
    });

    res.json(updatedWorkstation);
  } catch (error) {
    sendErrorResponse(res, error, req);
  }
};
