import { describe, it, expect } from "vitest";
import { paramString } from "./params";

describe("paramString", () => {
  it("returns string unchanged when non-empty", () => {
    expect(paramString("abc")).toBe("abc");
    expect(paramString("task-123")).toBe("task-123");
  });

  it("returns trimmed string when surrounded by whitespace", () => {
    expect(paramString("  id  ")).toBe("id");
    expect(paramString("\tid\n")).toBe("id");
  });

  it("returns null for empty string", () => {
    expect(paramString("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(paramString("   ")).toBeNull();
    expect(paramString("\t")).toBeNull();
  });

  it("accepts first element of string array", () => {
    expect(paramString(["only"])).toBe("only");
    expect(paramString(["first", "second"])).toBe("first");
  });

  it("returns trimmed first element when array of strings", () => {
    expect(paramString(["  x  "])).toBe("x");
  });

  it("returns null for array with empty or whitespace-only first element", () => {
    expect(paramString([""])).toBeNull();
    expect(paramString(["   "])).toBeNull();
  });

  it("returns null when first array element is not a string (second element ignored)", () => {
    expect(paramString([42, "valid"])).toBeNull();
    expect(paramString([null, "valid"])).toBeNull();
    expect(paramString([{}, "valid"])).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(paramString(undefined)).toBeNull();
  });

  it("returns null for non-string values (object, number, etc.)", () => {
    expect(paramString({})).toBeNull();
    expect(paramString({ id: "x" })).toBeNull();
    expect(paramString(42)).toBeNull();
    expect(paramString(null)).toBeNull();
    expect(paramString(true)).toBeNull();
  });
});
