import { z } from "zod";
import { parseDateQuery } from "./parse-date-query";

const DATE_PARAM_SCHEMA = z.union([
  z.string(),
  z.array(z.string()),
  z.undefined(),
]);

/**
 * Detects malformed or polluted date query parameters.
 * Strict policy: reject if any key starts with "date[" (e.g. date[foo]=bar), even when "date" is also present.
 * This avoids accepting "polluted" requests and keeps behavior unambiguous.
 */
export function hasMalformedNestedDateKey(
  query: Record<string, unknown>,
): boolean {
  return Object.keys(query).some((key) => key.startsWith("date["));
}

/**
 * Parses a date query parameter with protection against malformed nested keys.
 * Returns today's date if value is undefined/empty (by design), but rejects malformed nested keys.
 */
export function parseDateQueryParam(
  value: unknown,
  query?: Record<string, unknown>,
): { success: true; date: Date } | { success: false; error: string } {
  // Check for malformed nested date keys if query object is provided
  if (query && hasMalformedNestedDateKey(query)) {
    return { success: false as const, error: "Invalid date. Use YYYY-MM-DD." };
  }

  const result = DATE_PARAM_SCHEMA.safeParse(value);
  if (!result.success) {
    return { success: false as const, error: "Invalid date. Use YYYY-MM-DD." };
  }
  const date = parseDateQuery(result.data);
  if (date === null) {
    return { success: false as const, error: "Invalid date. Use YYYY-MM-DD." };
  }
  return { success: true as const, date };
}

/**
 * Policy: Reject repeated query parameters (e.g., ?employeeId=a&employeeId=b) with 400 error.
 * When Express parses repeated parameters, they become arrays. We explicitly reject arrays
 * to avoid ambiguity about which value to use.
 */
function validateSingleStringParam(
  value: unknown,
  paramName: string,
): { success: true; value: string } | { success: false; error: string } {
  if (Array.isArray(value)) {
    return {
      success: false as const,
      error: `Repeated query parameters are not allowed for "${paramName}". Use a single value.`,
    };
  }
  if (typeof value !== "string") {
    return {
      success: false as const,
      error: `Invalid query parameter "${paramName}". Expected a string.`,
    };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return {
      success: false as const,
      error: `Query parameter "${paramName}" cannot be empty.`,
    };
  }
  return { success: true as const, value: trimmed };
}

const ManagerDashboardQuerySchema = z.object({
  date: DATE_PARAM_SCHEMA.optional(),
  employeeId: z.union([z.string(), z.array(z.string())]).optional(),
  workstationId: z.union([z.string(), z.array(z.string())]).optional(),
});

export function parseManagerDashboardQuery(
  query: unknown,
):
  | { success: true; date: Date; employeeId?: string; workstationId?: string }
  | { success: false; error: string } {
  // Guard date[...] (strict policy) is done only here for this flow; parseDateQueryParam is
  // called below without the query object, so it does not re-check date[...] for the manager path.
  if (typeof query === "object" && query !== null && !Array.isArray(query)) {
    const queryObj = query as Record<string, unknown>;
    if (hasMalformedNestedDateKey(queryObj)) {
      return {
        success: false as const,
        error: "Invalid date. Use YYYY-MM-DD.",
      };
    }
  }

  const result = ManagerDashboardQuerySchema.safeParse(query);
  if (!result.success) {
    // Uniform error messages for invalid employeeId/workstationId (invalid_type, invalid_union, etc.)
    const errors = result.error.errors;
    const employeeIdError = errors.find((e) => e.path.includes("employeeId"));
    const workstationIdError = errors.find((e) =>
      e.path.includes("workstationId"),
    );

    if (employeeIdError) {
      return {
        success: false as const,
        error: 'Invalid query parameter "employeeId". Expected a string.',
      };
    }
    if (workstationIdError) {
      return {
        success: false as const,
        error: 'Invalid query parameter "workstationId". Expected a string.',
      };
    }

    return { success: false as const, error: "Invalid date. Use YYYY-MM-DD." };
  }

  const { date, employeeId, workstationId } = result.data;

  // Validate single string parameters (reject arrays)
  let validatedEmployeeId: string | undefined;
  if (employeeId !== undefined) {
    const employeeIdResult = validateSingleStringParam(
      employeeId,
      "employeeId",
    );
    if (employeeIdResult.success === false) {
      return {
        success: false as const,
        error: employeeIdResult.error,
      };
    }
    validatedEmployeeId = employeeIdResult.value;
  }

  let validatedWorkstationId: string | undefined;
  if (workstationId !== undefined) {
    const workstationIdResult = validateSingleStringParam(
      workstationId,
      "workstationId",
    );
    if (workstationIdResult.success === false) {
      return {
        success: false as const,
        error: workstationIdResult.error,
      };
    }
    validatedWorkstationId = workstationIdResult.value;
  }

  // Single guard for date[...] is above; no need to pass query again into parseDateQueryParam
  const dateResult = parseDateQueryParam(date);
  if (!dateResult.success) {
    return dateResult;
  }

  return {
    success: true as const,
    date: dateResult.date,
    employeeId: validatedEmployeeId,
    workstationId: validatedWorkstationId,
  };
}
