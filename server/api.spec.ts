/**
 * API integration tests for auth, permissions, and daily tasks.
 * Requires seeded database: run `pnpm seed` before tests.
 * Uses mgr@test.com (MANAGER) and emp@test.com (EMPLOYEE) with password "password".
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./index";

const app = createApp();

describe("Auth API", () => {
  it("POST /api/auth/signup with MANAGER returns 201 and token", async () => {
    const email = `mgr-${Date.now()}@test.com`;
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Test Manager",
        email,
        password: "password123",
        role: "MANAGER",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user.role).toBe("MANAGER");
    expect(res.body.user.email).toBe(email);
  });

  it("POST /api/auth/signup with EMPLOYEE returns 400 (only MANAGER allowed)", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Test Employee",
        email: `emp-${Date.now()}@test.com`,
        password: "password123",
        role: "EMPLOYEE",
      });

    expect(res.status).toBe(400);
  });

  it("POST /api/auth/login with valid credentials returns 200 and token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body.user.email).toBe("mgr@test.com");
    expect(res.body.user.role).toBe("MANAGER");
  });

  it("POST /api/auth/login with invalid password returns 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("GET /api/auth/profile without token returns 401", async () => {
    const res = await request(app).get("/api/auth/profile");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/profile with valid token returns 200 and user", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const token = loginRes.body.token;

    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("mgr@test.com");
  });
});

describe("Permissions - role-based access", () => {
  it("GET /api/manager/dashboard as EMPLOYEE returns 403", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });
    const token = loginRes.body.token;

    const res = await request(app)
      .get("/api/manager/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("GET /api/manager/dashboard as MANAGER returns 200", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "mgr@test.com", password: "password" });
    const token = loginRes.body.token;

    const res = await request(app)
      .get("/api/manager/dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dailyTasks");
  });

  it("POST /api/tasks/templates as EMPLOYEE returns 403", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });
    const token = loginRes.body.token;

    const res = await request(app)
      .post("/api/tasks/templates")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Test task",
        workstationId: "some-id",
        isRecurring: false,
      });

    expect(res.status).toBe(403);
  });
});

describe("Daily tasks API", () => {
  it("GET /api/tasks/daily without auth returns 401", async () => {
    const res = await request(app).get("/api/tasks/daily");
    expect(res.status).toBe(401);
  });

  it("GET /api/tasks/daily with valid employee token returns 200 and array", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "emp@test.com", password: "password" });
    const token = loginRes.body.token;

    const res = await request(app)
      .get("/api/tasks/daily")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
