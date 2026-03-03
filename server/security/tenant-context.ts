import type { PrismaClient } from "@prisma/client";
import type { JwtPayload } from "../lib/auth";
import prisma from "../lib/db";

export interface TenantContext {
  role: "MANAGER" | "EMPLOYEE";
  userId: string;
  teamIds: string[];
}

export async function loadTenantContextFromAuth(
  payload: JwtPayload,
  db: PrismaClient = prisma,
): Promise<TenantContext> {
  if (payload.role === "MANAGER") {
    const teams = await db.team.findMany({
      where: { managerId: payload.userId },
      select: { id: true },
    });
    return {
      role: "MANAGER",
      userId: payload.userId,
      teamIds: teams.map((team) => team.id),
    };
  }

  const employee = await db.user.findUnique({
    where: { id: payload.userId },
    select: { teamId: true },
  });

  return {
    role: "EMPLOYEE",
    userId: payload.userId,
    teamIds: employee?.teamId ? [employee.teamId] : [],
  };
}
