/**
 * Unit tests for sendErrorResponse: AppError, ZodError, Prisma-like errors (P2002, P2003, P2025), and fallback 500.
 */
import { describe, it, expect, vi } from "vitest";
import { ZodError } from "zod";
import { sendErrorResponse, AppError } from "./errors";
import type { Response } from "express";

function mockRes(): { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe("sendErrorResponse", () => {
  describe("Prisma-like error mappings (shape: code Pxxxx + meta or name or clientVersion)", () => {
    it("P2002 returns 409 and CONFLICT", () => {
      const res = mockRes() as unknown as Response;
      sendErrorResponse(res, { code: "P2002", meta: { target: ["email"] } });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: "A record with this value already exists.",
        code: "CONFLICT",
      });
    });

    it("P2003 returns 400 and CONSTRAINT", () => {
      const res = mockRes() as unknown as Response;
      sendErrorResponse(res, { code: "P2003", meta: {} });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Referenced record not found or constraint violation.",
        code: "CONSTRAINT",
      });
    });

    it("P2025 returns 404 and NOT_FOUND", () => {
      const res = mockRes() as unknown as Response;
      sendErrorResponse(res, { code: "P2025", meta: { cause: "Record to update not found." } });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Record not found.",
        code: "NOT_FOUND",
      });
    });

    it("object with code string but no meta is not treated as Prisma (fallback 500)", () => {
      const res = mockRes() as unknown as Response;
      sendErrorResponse(res, { code: "P2002" });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });

    it("object with code not matching Pxxxx is not treated as Prisma (fallback 500)", () => {
      const res = mockRes() as unknown as Response;
      sendErrorResponse(res, { code: "CONFLICT", meta: {} });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });

    it("P2025 with name but without meta is still mapped (relaxed Prisma shape)", () => {
      const res = mockRes() as unknown as Response;
      sendErrorResponse(res, { code: "P2025", name: "PrismaClientKnownRequestError" });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "Record not found.",
        code: "NOT_FOUND",
      });
    });
  });

  describe("AppError and ZodError", () => {
    it("AppError uses statusCode and message", () => {
      const res = mockRes() as unknown as Response;
      sendErrorResponse(res, new AppError(403, "Forbidden"));
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
    });

    it("ZodError returns 400 with details", () => {
      const res = mockRes() as unknown as Response;
      const err = new ZodError([{ path: ["x"], message: "Required", code: "invalid_type" }]);
      sendErrorResponse(res, err);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Validation error",
        details: expect.any(Array),
      });
    });
  });
});
