import "dotenv/config";
import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { verifyToken } from "./auth";

describe("verifyToken – missing required claims", () => {
  it("returns null when token is signed but missing userId/email/role", () => {
    const secret = process.env.JWT_SECRET || "test-secret";

    // Missing userId
    const tokenNoUserId = jwt.sign(
      { email: "a@b.com", role: "MANAGER" },
      secret,
      { expiresIn: "1h" }
    );
    expect(verifyToken(tokenNoUserId)).toBeNull();

    // Missing email
    const tokenNoEmail = jwt.sign(
      { userId: "u", role: "MANAGER" },
      secret,
      { expiresIn: "1h" }
    );
    expect(verifyToken(tokenNoEmail)).toBeNull();

    // Missing role
    const tokenNoRole = jwt.sign(
      { userId: "u", email: "a@b.com" },
      secret,
      { expiresIn: "1h" }
    );
    expect(verifyToken(tokenNoRole)).toBeNull();
  });
});

