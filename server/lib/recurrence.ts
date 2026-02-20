export type RecurrenceType = "daily" | "weekly" | "x_per_week";

export interface RecurrenceTemplateLike {
  isRecurring: boolean;
  recurrenceType?: string | null;
  recurrenceDays?: string | null;
}

function normalizeRecurrenceType(
  value: string | null | undefined,
): RecurrenceType {
  if (value === "weekly" || value === "x_per_week") return value;
  return "daily";
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

export function shouldTemplateAppearOnDate(
  template: RecurrenceTemplateLike,
  date: Date,
): boolean {
  if (!template.isRecurring) return false;
  const recurrenceType = normalizeRecurrenceType(template.recurrenceType);
  if (recurrenceType === "daily") return true;

  const days = parseRecurrenceDaysCsv(template.recurrenceDays);
  if (days.length === 0) return true;
  return days.includes(date.getDay());
}
