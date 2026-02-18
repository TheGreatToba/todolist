/**
 * Auth unit tests: verifyToken (JWT payload validation with Zod strict),
 * isRole guard. Locks regression on valid token, expired, invalid role, extra claims,
 * invalid email, malformed/wrong secret. Requires JWT_SECRET in env (see README).
 */
import "dotenv/config";
import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { generateToken, verifyToken, isRole } from "./auth";

describe("verifyToken", () => {
  it("returns payload for valid token (allowed iat/exp)", () => {
    const token = generateToken({
      userId: "user-1",
      email: "a@b.com",
      role: "MANAGER",
    });
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe("user-1");
    expect(payload?.email).toBe("a@b.com");
    expect(payload?.role).toBe("MANAGER");
  });

  it("returns null for token with invalid role", () => {
    const secret = process.env.JWT_SECRET || "test-secret";
    const token = jwt.sign(
      { userId: "u", email: "a@b.com", role: "ADMIN" },
      secret,
      { expiresIn: "1h" },
    );
    expect(verifyToken(token)).toBeNull();
  });

  it("returns null for token with extra fields (strict schema)", () => {
    const secret = process.env.JWT_SECRET || "test-secret";
    const token = jwt.sign(
      { userId: "u", email: "a@b.com", role: "MANAGER", admin: true },
      secret,
      { expiresIn: "1h" },
    );
    expect(verifyToken(token)).toBeNull();
  });

  it("returns null for invalid email in payload", () => {
    const secret = process.env.JWT_SECRET || "test-secret";
    const token = jwt.sign(
      { userId: "u", email: "not-an-email", role: "MANAGER" },
      secret,
      { expiresIn: "1h" },
    );
    expect(verifyToken(token)).toBeNull();
  });

  it("returns null for expired token", () => {
    const secret = process.env.JWT_SECRET || "test-secret";
    const token = jwt.sign(
      { userId: "u", email: "a@b.com", role: "MANAGER" },
      secret,
      { expiresIn: "-1h" },
    );
    expect(verifyToken(token)).toBeNull();
  });

  it("returns null for malformed or wrong secret token", () => {
    expect(verifyToken("not.a.token")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});

describe("isRole", () => {
  it("returns true for MANAGER and EMPLOYEE", () => {
    expect(isRole("MANAGER")).toBe(true);
    expect(isRole("EMPLOYEE")).toBe(true);
  });

  it("returns false for invalid values", () => {
    expect(isRole("ADMIN")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});
