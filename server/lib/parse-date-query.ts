const DATE_QUERY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an optional date query (YYYY-MM-DD). Returns start-of-day Date or null if invalid.
 * Rejects impossible calendar dates (e.g. 2025-02-31) via round-trip validation.
 *
 * Default: when value is undefined, empty string, or empty-first-element array, returns
 * today at 00:00:00. If you reuse this elsewhere, rely on this default only when
 * "no date = today" is the intended behaviour.
 *
 * Used by GET /api/tasks/daily, GET /api/manager/dashboard, and POST /api/cron/daily-tasks.
 */
export function parseDateQuery(value: unknown): Date | null {
  // No value at all → default to today
  if (value === undefined) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  let raw: string | undefined;

  if (typeof value === 'string') {
    raw = value;
  } else if (Array.isArray(value)) {
    const first = value[0];
    raw = typeof first === 'string' ? first : undefined;
  } else {
    // Present but not a string / string[] → treat as invalid
    return null;
  }

  // Present but empty string (or [""]) → follow "no date = today" convention
  if (!raw) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
  if (!DATE_QUERY_REGEX.test(raw)) return null;
  const date = new Date(raw + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return null;
  // Round-trip: ensure the date is calendar-valid (reject e.g. 2025-02-31)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (`${y}-${m}-${d}` !== raw) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}
