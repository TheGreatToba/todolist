import prisma from './db';
import type { Team } from '@prisma/client';

/**
 * Returns all team IDs that the given manager (userId) manages.
 * Used for dashboard, workstations, and task listing so multi-team managers see all their teams.
 */
export async function getManagerTeamIds(managerId: string): Promise<string[]> {
  const teams = await prisma.team.findMany({
    where: { managerId },
    select: { id: true },
  });
  return teams.map((t) => t.id);
}

/**
 * Returns all teams that the given manager manages (full records).
 * Use getManagerTeamIds when only IDs are needed (e.g. for filters).
 */
export async function getManagerTeams(managerId: string): Promise<Team[]> {
  return prisma.team.findMany({
    where: { managerId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Returns the first managed team for operations that require a single team
 * (e.g. create employee, create workstation when no teamId is provided).
 * Returns null if the manager has no team.
 */
export async function getManagerFirstTeam(managerId: string): Promise<Team | null> {
  return prisma.team.findFirst({
    where: { managerId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Returns true if the given teamId is one of the teams managed by managerId.
 */
export async function isTeamManagedBy(teamId: string, managerId: string): Promise<boolean> {
  const team = await prisma.team.findFirst({
    where: { id: teamId, managerId },
    select: { id: true },
  });
  return team !== null;
}
