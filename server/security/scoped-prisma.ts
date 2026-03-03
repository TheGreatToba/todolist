import type { PrismaClient } from "@prisma/client";
import prisma from "../lib/db";
import { AppError } from "../lib/errors";
import type { TenantContext } from "./tenant-context";

type SupportedModelName =
  | "team"
  | "user"
  | "workstation"
  | "employeeWorkstation"
  | "taskTemplate"
  | "dailyTask"
  | "dayPreparation"
  | "managerKpiEvent";

const SUPPORTED_MODELS = new Set<SupportedModelName>([
  "team",
  "user",
  "workstation",
  "employeeWorkstation",
  "taskTemplate",
  "dailyTask",
  "dayPreparation",
  "managerKpiEvent",
]);

const DIRECT_TEAM_MODELS = new Set<SupportedModelName>(["user", "workstation"]);

const SCOPED_METHODS = new Set([
  "findMany",
  "findFirst",
  "findUnique",
  "count",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

const METHODS_REQUIRING_DIRECT_TEAM_CLAUSE = new Set([
  "findMany",
  "findFirst",
  "update",
  "delete",
  "updateMany",
  "deleteMany",
]);

const QUICK_TASK_TEMPLATE_SOURCE_PREFIX = "quick";

function quickTaskSourcePrefixForManager(managerId: string): string {
  return `${QUICK_TASK_TEMPLATE_SOURCE_PREFIX}:${managerId}:`;
}

function mergeScopeWhere(
  scopeWhere: Record<string, unknown>,
  where: unknown,
): Record<string, unknown> {
  if (!where || typeof where !== "object") {
    return scopeWhere;
  }
  return {
    AND: [scopeWhere, where as Record<string, unknown>],
  };
}

function hasOwnTeamIdClause(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  return Object.prototype.hasOwnProperty.call(where, "teamId");
}

async function buildModelScopeWhere(
  modelName: SupportedModelName,
  tenant: TenantContext,
  client: PrismaClient,
): Promise<Record<string, unknown>> {
  switch (modelName) {
    case "team":
      return { id: { in: tenant.teamIds } };
    case "user":
      return { teamId: { in: tenant.teamIds } };
    case "workstation":
      return { teamId: { in: tenant.teamIds } };
    case "employeeWorkstation":
      return {
        workstation: {
          teamId: { in: tenant.teamIds },
        },
      };
    case "taskTemplate":
      if (tenant.role === "EMPLOYEE") {
        return { assignedToEmployeeId: tenant.userId };
      }
      return {
        OR: [
          {
            workstation: {
              teamId: { in: tenant.teamIds },
            },
          },
          {
            assignedToEmployee: {
              role: "EMPLOYEE",
              teamId: { in: tenant.teamIds },
            },
          },
          {
            createdById: tenant.userId,
            workstationId: null,
            assignedToEmployeeId: null,
          },
        ],
      };
    case "dailyTask": {
      if (tenant.role === "EMPLOYEE") {
        return { employeeId: tenant.userId };
      }
      const workstations = await client.workstation.findMany({
        where: { teamId: { in: tenant.teamIds } },
        select: { id: true },
      });
      const workstationIds = workstations.map((workstation) => workstation.id);
      const managerScopes: Array<Record<string, unknown>> = [
        {
          employee: {
            role: "EMPLOYEE",
            teamId: { in: tenant.teamIds },
          },
        },
        {
          taskTemplate: {
            workstation: {
              teamId: { in: tenant.teamIds },
            },
          },
        },
        {
          taskTemplate: {
            assignedToEmployee: {
              role: "EMPLOYEE",
              teamId: { in: tenant.teamIds },
            },
          },
        },
        {
          employeeId: null,
          templateSourceId: {
            startsWith: quickTaskSourcePrefixForManager(tenant.userId),
          },
        },
      ];
      if (workstationIds.length > 0) {
        managerScopes.push({
          employeeId: null,
          templateWorkstationId: { in: workstationIds },
        });
      }
      return {
        OR: managerScopes,
      };
    }
    case "dayPreparation":
      return { managerId: tenant.userId };
    case "managerKpiEvent":
      return { managerId: tenant.userId };
  }
}

/**
 * Creates a tenant-scoped Prisma proxy.
 * - Automatically injects tenant scope for scoped models.
 * - Rejects unsafe direct-team queries without explicit teamId clause.
 */
export function scopedPrisma(
  tenant: TenantContext,
  client: PrismaClient = prisma,
): PrismaClient {
  const root = client as unknown as Record<string, unknown>;

  return new Proxy(root, {
    get(target, prop, receiver) {
      if (typeof prop !== "string") {
        return Reflect.get(target, prop, receiver);
      }

      if (!SUPPORTED_MODELS.has(prop as SupportedModelName)) {
        if (prop === "$transaction") {
          const transactionFn = Reflect.get(target, prop, receiver) as (
            ...args: unknown[]
          ) => unknown;
          if (typeof transactionFn === "function") {
            return (...args: unknown[]) => {
              if (typeof args[0] === "function") {
                const callback = args[0] as (tx: PrismaClient) => unknown;
                const wrappedCallback = (tx: PrismaClient) =>
                  callback(scopedPrisma(tenant, tx));
                return transactionFn.call(target, wrappedCallback, args[1]);
              }
              return transactionFn.apply(target, args);
            };
          }
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }

      const modelName = prop as SupportedModelName;
      const delegate = Reflect.get(target, prop, receiver) as Record<
        string,
        unknown
      >;

      return new Proxy(delegate, {
        get(modelTarget, methodProp, modelReceiver) {
          const original = Reflect.get(modelTarget, methodProp, modelReceiver);
          if (
            typeof methodProp !== "string" ||
            typeof original !== "function"
          ) {
            return original;
          }

          if (!SCOPED_METHODS.has(methodProp)) {
            return (original as (...args: unknown[]) => unknown).bind(
              modelTarget,
            );
          }

          return async (args?: Record<string, unknown>) => {
            const scopeWhere = await buildModelScopeWhere(
              modelName,
              tenant,
              client,
            );

            if (
              DIRECT_TEAM_MODELS.has(modelName) &&
              METHODS_REQUIRING_DIRECT_TEAM_CLAUSE.has(methodProp) &&
              !hasOwnTeamIdClause(args?.where)
            ) {
              throw new AppError(
                500,
                `Unsafe query blocked: ${modelName}.${methodProp} requires an explicit teamId clause.`,
              );
            }

            if (methodProp === "findUnique") {
              const findFirst = Reflect.get(modelTarget, "findFirst") as (
                nextArgs?: Record<string, unknown>,
              ) => Promise<unknown>;
              return findFirst({
                ...(args ?? {}),
                where: mergeScopeWhere(scopeWhere, args?.where),
              });
            }

            if (methodProp === "update" || methodProp === "delete") {
              const findFirst = Reflect.get(modelTarget, "findFirst") as (
                nextArgs?: Record<string, unknown>,
              ) => Promise<unknown>;

              const visible = await findFirst({
                where: mergeScopeWhere(scopeWhere, args?.where),
                select: { id: true },
              });

              if (!visible) {
                throw new AppError(403, "Forbidden");
              }

              return (
                original as (
                  nextArgs?: Record<string, unknown>,
                ) => Promise<unknown>
              ).call(modelTarget, args);
            }

            return (
              original as (
                nextArgs?: Record<string, unknown>,
              ) => Promise<unknown>
            ).call(modelTarget, {
              ...(args ?? {}),
              where: mergeScopeWhere(scopeWhere, args?.where),
            });
          };
        },
      });
    },
  }) as unknown as PrismaClient;
}
