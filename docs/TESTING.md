# Testing conventions

Short guide to keep client tests consistent, readable, and maintainable.

## Stack

- **Vitest** (run with `pnpm test` or `pnpm test:client`)
- **React Testing Library (RTL)** for component tests
- **@testing-library/jest-dom** for DOM matchers (`toBeInTheDocument`, `toBeDisabled`, etc.)
- **MSW** for semi-integrated tests (API mocked at network level)

## Queries: prefer role and scope

1. **Prefer `getByRole` with `name`** (accessible name) over raw text when possible:
   - `getByRole('button', { name: /sign in/i })` instead of `getByText('Sign in')` when the element is a button.
   - Use `getByLabelText` for form fields.
2. **Scope with `within(container)`** to avoid duplicate nodes and false positives:
   - `const { container } = render(...); const view = within(container); view.getByRole(...)`.
   - For a subsection, scope further: `within(view.getByRole('navigation')).getByRole('button', ...)`.
3. **Avoid `getAllBy*[0]`** as a default: it hides the reason for duplicates. Prefer fixing the scope (e.g. `within(nav)`) or a single, precise query.

**Assertions d’erreur** : privilégier le **message visible par l’utilisateur** (texte affiché dans l’UI). Quand l’erreur est exposée dans un élément accessible, cibler par **rôle** : `getByRole('alert', { name: /invalid credentials/i })` plutôt que `getByText` seul, pour couvrir UX + accessibilité (lecteurs d’écran). L’élément d’erreur doit avoir `role="alert"` et un nom accessible (ex. `aria-label` ou texte).

## Mocks vs MSW

| Approach                  | When to use                                                                  | Example                                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mock hooks / modules**  | Unit-style tests: isolate the component, control all data and callbacks.     | Mock `useAuth`, `@/hooks/queries` in `Login.spec.tsx`, `EmployeeDashboard.spec.tsx`.                                                                                                                         |
| **MSW (semi-integrated)** | Critical flows where you want real hooks and real API calls, but no backend. | `Login.semi-integrated.spec.tsx` (login 200 + 401). `Auth.profile-401.spec.tsx` (GET profile 401 → session expirée, user null). `ManagerDashboard.semi-integrated.spec.tsx` (dashboard avec réponses vides). |

- **Mock**: fast, full control, lower integration confidence.
- **MSW**: real React tree and hooks, API shape validated by handlers; add 1–2 such tests for login and dashboard.

## Test data and stability

- **Dates**: mock `@/lib/date-utils` (e.g. `todayLocalISO()`, `isToday()`) with a fixed date instead of `vi.useFakeTimers()` when using `userEvent` (avoids timeouts).
- **QueryClient**: create a **new** `QueryClient` per test (e.g. in `renderWithProviders`), with `defaultOptions: { queries: { retry: false }, mutations: { retry: false } }` to avoid retries and shared cache between tests.

## CI

- **`pnpm test`** (or `pnpm run ci`): full suite (typecheck, seed, client + server tests). Use as the main gate so backend regressions are visible.
- **`pnpm test:client`**: client-only tests. Use for fast frontend feedback; keep a separate CI job so the full suite remains the source of truth.

**Durée de `test:client`** : seuils d’alerte pour garder le feedback rapide (durée en CI) :

| Seuil   | Durée (ex. CI) | Action                                                                                                                         |
| ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cible   | ≤ 30 s         | À maintenir.                                                                                                                   |
| Warning | &gt; 30 s      | Vérifier les specs lentes, envisager parallélisation ou découpage.                                                             |
| Action  | &gt; 45 s      | Investiguer (profiler, isoler les fichiers lents), réduire redondance ou désactiver temporairement les tests les plus coûteux. |

**Suivi de tendance** : ne pas se limiter à la valeur instantanée. Garder un suivi de la durée (ex. stocker la sortie de `pnpm test:client` dans un artifact CI, ou un fichier de métriques comparé au run précédent) pour détecter les dérives progressives et réagir avant de dépasser les seuils.

## Setup

- **`client/vitest-setup.ts`**: loads `@testing-library/jest-dom/vitest` and runs `cleanup()` in `afterEach`. Explicit cleanup is kept because Vitest does not run RTL’s auto-cleanup by default in this setup.
- **MSW**: handlers in `client/test/mocks/handlers.ts`, server in `client/test/mocks/server.ts`. Use `server.listen()` in `beforeAll`, `server.resetHandlers()` in `afterEach`, `server.close()` in `afterAll` in specs that use MSW.
