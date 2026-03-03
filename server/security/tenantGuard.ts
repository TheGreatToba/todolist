import { AppError } from "../lib/errors";
import type { TenantContext } from "./tenant-context";

export function assertTenantAccessToResource(
  tenant: TenantContext,
  resourceTeamId: string | null | undefined,
): void {
  if (!resourceTeamId || !tenant.teamIds.includes(resourceTeamId)) {
    throw new AppError(403, "Forbidden");
  }
}

export function assertManagerOwnsTeam(
  tenant: TenantContext,
  teamId: string | null | undefined,
): void {
  if (tenant.role !== "MANAGER") {
    throw new AppError(403, "Forbidden");
  }
  assertTenantAccessToResource(tenant, teamId);
}

export function assertEmployeeOwnsTask(
  tenant: TenantContext,
  task: { employeeId: string | null | undefined },
): void {
  if (tenant.role !== "EMPLOYEE") {
    throw new AppError(403, "Forbidden");
  }
  if (!task.employeeId || task.employeeId !== tenant.userId) {
    throw new AppError(403, "Forbidden");
  }
}
