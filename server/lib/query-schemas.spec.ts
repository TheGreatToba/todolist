import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseDateQueryParam,
  parseManagerDashboardQuery,
  hasMalformedNestedDateKey,
} from "./query-schemas";

describe("hasMalformedNestedDateKey", () => {
  it('returns false when "date" key exists', () => {
    expect(hasMalformedNestedDateKey({ date: "2025-02-15" })).toBe(false);
    expect(
      hasMalformedNestedDateKey({ date: "2025-02-15", other: "value" }),
    ).toBe(false);
  });

  it("returns false when no date-related keys exist", () => {
    expect(hasMalformedNestedDateKey({})).toBe(false);
    expect(hasMalformedNestedDateKey({ other: "value" })).toBe(false);
  });

  it("returns true when nested date key exists (date[foo])", () => {
    expect(hasMalformedNestedDateKey({ "date[foo]": "bar" })).toBe(true);
    expect(
      hasMalformedNestedDateKey({ "date[foo]": "bar", other: "value" }),
    ).toBe(true);
  });

  it('returns true when both "date" and nested keys exist (strict: reject polluted query)', () => {
    expect(
      hasMalformedNestedDateKey({ date: "2025-02-15", "date[foo]": "bar" }),
    ).toBe(true);
  });
});

describe("parseDateQueryParam", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today when value is undefined", () => {
    const fixed = new Date("2025-06-15T14:30:00");
    vi.useFakeTimers({ now: fixed.getTime() });
    const result = parseDateQueryParam(undefined);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getFullYear()).toBe(2025);
      expect(result.date.getMonth()).toBe(5);
      expect(result.date.getDate()).toBe(15);
      expect(result.date.getHours()).toBe(0);
    }
  });

  it("returns today when value is empty string", () => {
    const fixed = new Date("2025-03-01T09:00:00");
    vi.useFakeTimers({ now: fixed.getTime() });
    const result = parseDateQueryParam("");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getFullYear()).toBe(2025);
      expect(result.date.getMonth()).toBe(2);
      expect(result.date.getDate()).toBe(1);
    }
  });

  it("parses valid YYYY-MM-DD and returns start-of-day", () => {
    const result = parseDateQueryParam("2025-02-15");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getFullYear()).toBe(2025);
      expect(result.date.getMonth()).toBe(1);
      expect(result.date.getDate()).toBe(15);
      expect(result.date.getHours()).toBe(0);
    }
  });

  it("accepts date as first element of array", () => {
    const result = parseDateQueryParam(["2025-12-31"]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getFullYear()).toBe(2025);
      expect(result.date.getMonth()).toBe(11);
      expect(result.date.getDate()).toBe(31);
    }
  });

  it("returns error for non-YYYY-MM-DD format", () => {
    expect(parseDateQueryParam("15/02/2025").success).toBe(false);
    expect(parseDateQueryParam("2025-2-15").success).toBe(false);
    expect(parseDateQueryParam("not-a-date").success).toBe(false);
    expect(parseDateQueryParam("20250215").success).toBe(false);
  });

  it("returns error for invalid calendar date", () => {
    expect(parseDateQueryParam("2025-02-31").success).toBe(false);
    expect(parseDateQueryParam("2025-13-01").success).toBe(false);
    expect(parseDateQueryParam("2025-11-31").success).toBe(false);
  });

  it("rejects malformed nested date keys when query object provided", () => {
    const result = parseDateQueryParam(undefined, { "date[foo]": "bar" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid date. Use YYYY-MM-DD.");
    }
  });

  it("allows valid date even when query object has other keys", () => {
    const result = parseDateQueryParam("2025-02-15", { other: "value" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getDate()).toBe(15);
    }
  });

  it("rejects when query has both date and nested keys (strict policy)", () => {
    const result = parseDateQueryParam("2025-02-15", {
      date: "2025-02-15",
      "date[foo]": "bar",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid date. Use YYYY-MM-DD.");
    }
  });
});

describe("parseManagerDashboardQuery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses valid query with all parameters", () => {
    const fixed = new Date("2025-06-15T14:30:00");
    vi.useFakeTimers({ now: fixed.getTime() });
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      employeeId: "emp-123",
      workstationId: "ws-456",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getDate()).toBe(15);
      expect(result.employeeId).toBe("emp-123");
      expect(result.workstationId).toBe("ws-456");
    }
  });

  it("defaults to today when date is missing", () => {
    const fixed = new Date("2025-06-15T14:30:00");
    vi.useFakeTimers({ now: fixed.getTime() });
    const result = parseManagerDashboardQuery({
      employeeId: "emp-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getDate()).toBe(15);
      expect(result.employeeId).toBe("emp-123");
    }
  });

  it("rejects malformed nested date keys", () => {
    const result = parseManagerDashboardQuery({
      "date[foo]": "bar",
      employeeId: "emp-123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid date. Use YYYY-MM-DD.");
    }
  });

  it("rejects polluted query with single guard at entry (non-regression: no second check in parseDateQueryParam)", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      "date[foo]": "bar",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("YYYY-MM-DD");
    }
    // Behavioral lock: manager path guards date[...] only at entry and calls parseDateQueryParam(date)
    // without query, so the guard is not run again. If parseDateQueryParam were called with query
    // here, we would have a double guard; this test would still pass but the contract would change.
  });

  it("rejects repeated employeeId parameter (array)", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      employeeId: ["emp-123", "emp-456"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain(
        'Repeated query parameters are not allowed for "employeeId"',
      );
    }
  });

  it("rejects repeated workstationId parameter (array)", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      workstationId: ["ws-123", "ws-456"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain(
        'Repeated query parameters are not allowed for "workstationId"',
      );
    }
  });

  it("rejects empty employeeId string", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      employeeId: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("cannot be empty");
    }
  });

  it("rejects empty workstationId string", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      workstationId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("cannot be empty");
    }
  });

  it("trims whitespace from employeeId and workstationId", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      employeeId: "  emp-123  ",
      workstationId: "  ws-456  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.employeeId).toBe("emp-123");
      expect(result.workstationId).toBe("ws-456");
    }
  });

  it("rejects invalid date format", () => {
    const result = parseManagerDashboardQuery({
      date: "invalid-date",
      employeeId: "emp-123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid date. Use YYYY-MM-DD.");
    }
  });

  it("rejects invalid calendar date", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-31",
      employeeId: "emp-123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Invalid date. Use YYYY-MM-DD.");
    }
  });

  it("allows query with only date (no filters)", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getDate()).toBe(15);
      expect(result.employeeId).toBeUndefined();
      expect(result.workstationId).toBeUndefined();
    }
  });

  it("allows query with no parameters (defaults to today)", () => {
    const fixed = new Date("2025-06-15T14:30:00");
    vi.useFakeTimers({ now: fixed.getTime() });
    const result = parseManagerDashboardQuery({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.date.getDate()).toBe(15);
    }
  });

  it("rejects non-string employeeId with clear param message", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      employeeId: 123 as unknown as string,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        'Invalid query parameter "employeeId". Expected a string.',
      );
    }
  });

  it("rejects non-string workstationId with clear param message", () => {
    const result = parseManagerDashboardQuery({
      date: "2025-02-15",
      workstationId: { foo: "bar" } as unknown as string,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        'Invalid query parameter "workstationId". Expected a string.',
      );
    }
  });
});
