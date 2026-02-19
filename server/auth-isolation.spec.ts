/**
 * Ultra-minimal isolated test for authentication persistence.
 * This file is separate from api.spec.ts to exclude interference from other tests.
 *
 * - Uses the in-process app (request(app)) only, so MSW does not intercept.
 * - Creates its own manager user via signup (no seed dependency); cleans up in afterAll.
 * - Verifies that login returns Set-Cookie and that profile succeeds when the cookie is sent.
 *
 * Run: pnpm test -- server/auth-isolation.spec.ts
 * Debug: DEBUG_AUTH_TESTS=1 pnpm test -- server/auth-isolation.spec.ts
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";

import { createApp } from "./index";
import prisma from "./lib/db";

const app = createApp();
let testEmail: string;
let testPassword: string;
let createdUserId: string;
let createdTeamId: string | null = null;

function getAuthCookie(loginRes: request.Response): string | null {
  const setCookie = loginRes.headers["set-cookie"];
  if (!setCookie || !Array.isArray(setCookie) || setCookie.length === 0)
    return null;
  const name = process.env.NODE_ENV === "production" ? "__Host-token" : "token";
  const line = setCookie.find((c: string) => c.startsWith(name + "="));
  if (!line) return null;
  return line.split(";")[0].trim();
}

describe("Auth isolation test", () => {
  beforeAll(async () => {
    testEmail = `auth-iso-${Date.now()}@test.com`;
    testPassword = "password123";
    const signupRes = await request(app).post("/api/auth/signup").send({
      name: "Auth Isolation Manager",
      email: testEmail,
      password: testPassword,
      role: "MANAGER",
    });
    expect(signupRes.status).toBe(201);
    createdUserId = signupRes.body.user.id;
    createdTeamId = signupRes.body.user.teamId ?? null;
  });

  afterAll(async () => {
    if (createdUserId) {
      await prisma.user
        .delete({ where: { id: createdUserId } })
        .catch(() => {});
    }
    if (createdTeamId) {
      await prisma.team
        .delete({ where: { id: createdTeamId } })
        .catch(() => {});
    }
  });

  it("POST /api/auth/login returns 200 and Set-Cookie, GET /api/auth/profile with cookie returns 200", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: testPassword });

    if (process.env.DEBUG_AUTH_TESTS) {
      console.log(
        "[DEBUG] Login status:",
        loginRes.status,
        "Set-Cookie:",
        loginRes.headers["set-cookie"],
      );
    }

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty("user");
    expect(loginRes.body.user.email).toBe(testEmail);

    const cookie = getAuthCookie(loginRes);
    expect(cookie).toBeTruthy();

    const profileRes = await request(app)
      .get("/api/auth/profile")
      .set("Cookie", cookie!);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body).toHaveProperty("user");
    expect(profileRes.body.user.email).toBe(testEmail);
  });

  it("GET /api/auth/profile without cookie returns 401", async () => {
    const res = await request(app).get("/api/auth/profile");
    expect(res.status).toBe(401);
  });
});
