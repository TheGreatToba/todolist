export type RecurrenceType = "daily" | "weekly" | "x_per_week" | "monthly";
export type RecurrenceMode =
  | "schedule_based"
  | "after_completion"
  | "manual_trigger";
export type RecurrenceIntervalUnit = "day" | "week" | "month";

export interface RecurrenceTemplateLike {
  isRecurring: boolean;
  recurrenceMode?: string | null;
  recurrenceType?: string | null;
  recurrenceDays?: string | null;
  recurrenceDayOfMonth?: number | null;
  recurrenceInterval?: number | null;
  recurrenceIntervalUnit?: string | null;
}

export function normalizeRecurrenceMode(
  value: string | null | undefined,
): RecurrenceMode {
  if (value === "after_completion" || value === "manual_trigger") return value;
  return "schedule_based";
}

function normalizeRecurrenceType(
  value: string | null | undefined,
): RecurrenceType {
  if (value === "weekly" || value === "x_per_week" || value === "monthly") {
    return value;
  }
  return "daily";
}

export function normalizeRecurrenceIntervalUnit(
  value: string | null | undefined,
): RecurrenceIntervalUnit {
  if (value === "week" || value === "month") return value;
  return "day";
}

function normalizePositiveInterval(value: number | null | undefined): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    return 1;
  }
  return value as number;
}

function normalizeDayOfMonth(value: number | null | undefined): number {
  if (!Number.isInteger(value)) return 1;
  return Math.min(31, Math.max(1, value as number));
}

export function parseRecurrenceDaysCsv(
  value: string | null | undefined,
): number[] {
  if (!value) return [];
  const parsed = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}

export function shouldTemplateAutoGenerate(
  template: Pick<RecurrenceTemplateLike, "isRecurring" | "recurrenceMode">,
): boolean {
  if (!template.isRecurring) return false;
  return normalizeRecurrenceMode(template.recurrenceMode) !== "manual_trigger";
}

export function shouldTemplateAppearOnDate(
  template: RecurrenceTemplateLike,
  date: Date,
): boolean {
  if (!shouldTemplateAutoGenerate(template)) return false;
  if (normalizeRecurrenceMode(template.recurrenceMode) !== "schedule_based") {
    return false;
  }

  const recurrenceType = normalizeRecurrenceType(template.recurrenceType);
  if (recurrenceType === "daily") return true;
  if (recurrenceType === "monthly") {
    return (
      date.getDate() === normalizeDayOfMonth(template.recurrenceDayOfMonth)
    );
  }

  const days = parseRecurrenceDaysCsv(template.recurrenceDays);
  if (days.length === 0) return true;
  return days.includes(date.getDay());
}

export function getAfterCompletionConfig(
  template: Pick<
    RecurrenceTemplateLike,
    | "isRecurring"
    | "recurrenceMode"
    | "recurrenceInterval"
    | "recurrenceIntervalUnit"
  >,
): { interval: number; intervalUnit: RecurrenceIntervalUnit } | null {
  if (!template.isRecurring) return null;
  if (normalizeRecurrenceMode(template.recurrenceMode) !== "after_completion") {
    return null;
  }
  return {
    interval: normalizePositiveInterval(template.recurrenceInterval),
    intervalUnit: normalizeRecurrenceIntervalUnit(
      template.recurrenceIntervalUnit,
    ),
  };
}

export function addIntervalToDate(
  baseDate: Date,
  interval: number,
  intervalUnit: RecurrenceIntervalUnit,
): Date {
  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);

  if (intervalUnit === "day") {
    result.setDate(result.getDate() + interval);
    return result;
  }
  if (intervalUnit === "week") {
    result.setDate(result.getDate() + interval * 7);
    return result;
  }

  result.setMonth(result.getMonth() + interval);
  return result;
}
