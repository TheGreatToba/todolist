# AGENTS.md - SaaS Restaurant (Multi-Tenant Production Rules)

You are working on a production-grade multi-tenant B2B SaaS for restaurants.
This system already runs in production.

**Contexte produit et architecture** : [contexte.md](contexte.md) (vision, utilisateurs, flux, modèle de données, fichiers clés).

Priority order:
1. Never break database integrity
2. Never break tenant isolation
3. Keep the system backward-compatible
4. Improve code quality when safe

---

## STACK OVERVIEW

Backend:
- Node.js
- Express 5
- Prisma 5
- PostgreSQL
- JWT auth (httpOnly cookie)
- CSRF protection

Frontend:
- React 18 (SPA)
- React Router 6
- TypeScript
- Vite
- TailwindCSS 3
- Radix UI
- @tanstack/react-query

Deployment:
- Single PostgreSQL database
- Logical multi-tenancy via Team
- prisma migrate deploy in production

---

## MULTI-TENANT ARCHITECTURE (CRITICAL)

The application is multi-tenant using logical isolation.

Tenant model:
- A Team represents a restaurant/site.
- Managers own one or more Teams.
- Employees belong to one Team.
- All tenant-sensitive queries MUST respect team boundaries.

Tenant-sensitive models include:
- team
- user
- workstation
- employeeWorkstation
- taskTemplate
- dailyTask
- dayPreparation
- managerKpiEvent

### Critical Rule

Tenant-sensitive models MUST always go through scopedPrisma:

```ts
const prisma = scopedPrisma(tenant);
```

The scopedPrisma proxy:
- Automatically injects tenant filters
- Blocks unsafe queries
- Prevents cross-tenant access

Do not use raw PrismaClient for tenant-sensitive models in routes or business logic.

This rule applies to:
- Routes
- Services
- Background jobs
- Any server-side module accessing tenant data

### Bootstrap Exception (before tenant is resolved)

A raw PrismaClient call is allowed only for authentication/bootstrap flows where tenant is not known yet (for example login, session restore, list my teams).

In these flows:
- Scope queries by authenticated user identity (user id/email)
- Return only teams the authenticated user belongs to
- Do not perform tenant-sensitive writes before tenant resolution
- Resolve tenant as early as possible, then switch to scopedPrisma(tenant)

---

## SECURITY INVARIANTS (DO NOT BREAK)

1. A manager must only see their Teams.
2. An employee must only see their own data and Team data.
3. All backend authorization must be enforced server-side.
4. Never rely on frontend validation for security.
5. Never trust route params without scope validation.

When creating or updating an API route:
- Extract tenant context first
- Extract role from authenticated payload
- Use scopedPrisma(tenant) for tenant-sensitive models
- Validate ownership/scope before returning data
- Reject out-of-scope access

### Access-Denied Response Policy

- Default policy: return 403 for out-of-scope access.
- If an endpoint must hide resource existence, return 404 for non-readable resources.
- Pick one policy per endpoint and keep it consistent in tests.

---

## DATABASE SAFETY RULES (VERY IMPORTANT)

This system is already in production.

### Allowed

- Add new columns (nullable or with safe defaults)
- Add new tables
- Add indexes (including performance indexes, but avoid long production locks)
- Add foreign keys (after verifying no orphan data)
- Add new enums safely
- Add new roles

### Forbidden

- Dropping tables
- Dropping columns
- Changing column types destructively
- Removing constraints that protect integrity
- Resetting database
- Data migrations that delete production data

If a schema change is required:
- Modify schema.prisma
- Explain exactly what the migration will do
- Do NOT assume migration has been executed
- State that migration must be run manually in production

Schema changes must follow an additive migration strategy.

Safe examples:
- Add nullable column
- Add column with default
- Add new table

Unsafe examples:
- Drop existing column
- Change column type without fallback
- Remove unique constraint

If a change may impact existing production data, explain migration risk clearly.

---

## TRANSACTIONS

Use Prisma transactions when:
- Multiple related writes must remain consistent
- Creating linked records
- Performing batch updates

Prefer safety over micro-optimization.

For tenant-sensitive operations, always use the scoped client:

```ts
const prisma = scopedPrisma(tenant);
await prisma.$transaction(...)
```

Never open a transaction using the global PrismaClient for tenant-scoped operations.

---

## RAW SQL SAFETY

Avoid `$queryRaw` / `$executeRaw` for tenant-sensitive operations.

If raw SQL is unavoidable:
- Use parameterized queries only (no string interpolation)
- Include explicit tenant filter in the query
- Document why scopedPrisma was insufficient
- Add tests proving cross-tenant access is impossible

---

## ARCHITECTURE PRINCIPLES

- Follow existing patterns before introducing new ones.
- Prefer extending current structure instead of rewriting.
- Do not refactor unrelated modules.
- Keep changes minimal and scoped.
- If improvement is possible without risk, suggest it.

Improvements are welcome only if they:
- Do not break DB integrity
- Do not break tenant isolation
- Remain backward-compatible

Avoid introducing N+1 query patterns.
Prefer efficient Prisma queries with proper where clauses.
Be mindful of performance on large tenant datasets.

---

## TESTING RULES

If modifying:
- Business logic: update or create tests
- Tenant logic: verify isolation is preserved
- Routes: verify role validation remains intact

Minimum tenant coverage:
- Manager cannot read/write another manager's team data
- Employee cannot access another team
- Out-of-scope access returns the configured policy (403 or 404)

All changes must pass:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

---

## PRODUCT EVOLUTION

The system will evolve:
- New roles may be added
- New tenant types may appear
- Permissions may grow

When adding roles:
- Do not duplicate logic
- Prefer centralized role-check helpers (for example `requireRole` or permission maps)
- Avoid scattering role conditions across multiple files
- Do not hardcode fragile logic
- Prefer extensible patterns
- Avoid duplicating role logic inline inside route handlers

---

## NEVER DO

- Never bypass scopedPrisma for tenant-sensitive models
- Never run destructive schema/data changes in production
- Never introduce unscoped raw SQL on tenant data
- Never remove existing tests without reason
- Never rewrite architecture without explicit request

---

## DEFINITION OF DONE

A task is complete only if:
- Tenant isolation is preserved
- Database integrity is preserved
- Feature works
- No TypeScript errors
- Tests pass
- No unsafe query patterns introduced
- Changes are backward-compatible

Focus on stability, correctness, and safe evolution.
