/**
 * MSW request handlers for semi-integrated tests.
 * Mock API responses without mocking React hooks (AuthContext, queries).
 *
 * We keep realistic empty/partial responses (empty lists, minimal payloads)
 * so the UI is tested for robustness, not only happy path.
 */
import { http, HttpResponse } from "msw";
import type { User } from "@shared/api";

const defaultManager: User = {
  id: "msw-manager-1",
  name: "MSW Manager",
  email: "mgr@test.com",
  role: "MANAGER",
  teamId: "team-1",
};

/**
 * POST /api/auth/login – 200 for mgr@test.com/password, 401 with body.error for others.
 * Covers both success and error paths (e.g. "Invalid credentials" in UI).
 */
export const loginSuccessHandler = http.post(
  "*/api/auth/login",
  async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === "mgr@test.com" && body.password === "password") {
      return HttpResponse.json({ user: defaultManager });
    }
    return HttpResponse.json({ error: "Invalid credentials" }, { status: 401 });
  },
);

/** GET /api/auth/profile – returns user (e.g. after login) */
export const profileSuccessHandler = http.get("*/api/auth/profile", () =>
  HttpResponse.json({ user: defaultManager }),
);

/** GET /api/auth/profile – unauthenticated */
export const profileUnauthorizedHandler = http.get(
  "*/api/auth/profile",
  () => new HttpResponse(null, { status: 401 }),
);

/**
 * GET /api/manager/dashboard – minimal, realistic payload (empty lists).
 * Keeps UI tested for “no data yet” / new team scenarios.
 */
export const managerDashboardHandler = http.get("*/api/manager/dashboard", () =>
  HttpResponse.json({
    team: { id: "team-1", name: "MSW Team", members: [] },
    date: "2025-02-19",
    dailyTasks: [],
    workstations: [],
  }),
);

/** GET /api/workstations – empty list (realistic for new team). */
export const workstationsHandler = http.get("*/api/workstations", () =>
  HttpResponse.json([]),
);

/** GET /api/team/members – empty list (realistic for new team). */
export const teamMembersHandler = http.get("*/api/team/members", () =>
  HttpResponse.json([]),
);
