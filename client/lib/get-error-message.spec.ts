import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./get-error-message";

const FALLBACK = "Something went wrong.";

describe("getErrorMessage", () => {
  it("returns fallback for null and undefined", () => {
    expect(getErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for empty or whitespace-only string", () => {
    expect(getErrorMessage("", FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage("   ", FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage("\t\n", FALLBACK)).toBe(FALLBACK);
  });

  it("returns trimmed string for non-empty string", () => {
    expect(getErrorMessage("hello", FALLBACK)).toBe("hello");
    expect(getErrorMessage("  ok  ", FALLBACK)).toBe("ok");
  });

  it("returns message for Error instance", () => {
    expect(getErrorMessage(new Error("Network error"), FALLBACK)).toBe(
      "Network error",
    );
    expect(getErrorMessage(new Error("  trimmed  "), FALLBACK)).toBe("trimmed");
  });

  it("returns fallback for Error with empty or whitespace message", () => {
    expect(getErrorMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage(new Error("   "), FALLBACK)).toBe(FALLBACK);
  });

  it("returns message for object with string message (e.g. API errors)", () => {
    expect(getErrorMessage({ message: "API error" }, FALLBACK)).toBe(
      "API error",
    );
    expect(getErrorMessage({ message: "  custom  " }, FALLBACK)).toBe("custom");
  });

  it("returns fallback for object with empty or whitespace message", () => {
    expect(getErrorMessage({ message: "" }, FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage({ message: " " }, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for object without message property", () => {
    expect(getErrorMessage({ code: 500 }, FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage({ status: "error" }, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for object with non-string message", () => {
    expect(getErrorMessage({ message: 123 }, FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage({ message: null }, FALLBACK)).toBe(FALLBACK);
  });

  it("returns fallback for other types", () => {
    expect(getErrorMessage(42, FALLBACK)).toBe(FALLBACK);
    expect(getErrorMessage(true, FALLBACK)).toBe(FALLBACK);
  });
});
