# Tenant Isolation Architecture

## Goal

Harden logical multi-tenant isolation for a single PostgreSQL database:

- No business route should recalculate manager team scope.
- Tenant scope must be loaded once per request.
- Tenant-scoped Prisma access must be centralized.

## Request Pipeline

1. `requireAuth` validates JWT and sets `req.auth`.
2. `requireTenantContext` resolves and stores:
   - Manager: all managed team IDs.
   - Employee: own `teamId` as single-element array.
3. Route handlers read `req.tenant` through `getTenantOrThrow`.

This is wired globally in `server/index.ts` for authenticated routes via:

- `withTenantContext = [requireAuth, requireTenantContext]`
- `withManagerTenantContext = [requireAuth, requireTenantContext, requireRole("MANAGER")]`

## Security Modules

### 1) Tenant context loader

- File: `server/security/tenant-context.ts`
- API: `loadTenantContextFromAuth(payload)`
- Used by HTTP middleware and Socket.IO auth.

### 2) Scoped Prisma wrapper

- File: `server/security/scoped-prisma.ts`
- API: `scopedPrisma(tenant)`
- Behaviors:
  - Injects tenant visibility `where` on scoped models.
  - Converts scoped `findUnique` into scoped `findFirst`.
  - Blocks unsafe direct-team queries (`user`, `workstation`) when `teamId` clause is missing for `findMany/findFirst/update/delete`.
  - Prevents `update/delete` on out-of-scope records via pre-check.

### 3) Tenant guards

- File: `server/security/tenantGuard.ts`
- APIs:
  - `assertManagerOwnsTeam(tenant, teamId)`
  - `assertEmployeeOwnsTask(tenant, task)`
  - `assertTenantAccessToResource(tenant, resourceTeamId)`

## Route Refactor Example (DailyTask)

- File: `server/routes/tasks.ts`
- Refactored handlers:
  - `handleGetEmployeeDailyTasks`
  - `handleUpdateDailyTask`
- Changes:
  - Uses `getTenantOrThrow(req, res)` instead of recalculating team IDs.
  - Uses `scopedPrisma(tenant)` for tenant-scoped read/update.
  - Uses `tenantGuard` asserts for role/team access checks.
  - External direct-ID access now returns `403` when record exists but is out of scope.

## Scoped Adoption

- `scopedPrisma(tenant)` is now used across business route modules:
  - `server/routes/tasks.ts`
  - `server/routes/workstations.ts`
  - `server/routes/metrics.ts`
- For tenant-aware handlers, reads/writes flow through scoped delegates.
- `tenantGuard` helpers are used as the central access-check primitives instead of ad hoc `includes/has` checks.

## Additive DB Hardening

- Prisma schema: `Team.tenantKey String? @unique` (RLS preparation).
- Migration:
  - `prisma/migrations/20260303221500_tenant_hardening_additive/migration.sql`
  - Adds `Team.tenantKey` + unique index.
  - Ensures key tenant-scope indexes exist.
  - Ensures core FK constraints exist (idempotent checks).
  - No destructive changes.

## Security Tests

- File: `server/tenant-security.spec.ts`
- Covered cases:
  - Manager A cannot read workstation data from tenant B.
  - Employee cannot modify task from another team.
  - Direct external ID update request returns `403`.
  - `scopedPrisma` rejects unsafe `findMany` without `teamId` clause.
