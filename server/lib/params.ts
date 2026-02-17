/**
 * Normalizes a single route param (e.g. req.params.taskId) to a non-empty trimmed string or null.
 * Use for validating IDs: rejects undefined, empty string, whitespace-only, and non-string values.
 * For arrays, only the first element (array[0]) is considered; other elements are ignored.
 */
export function paramString(value: unknown): string | null {
  let s: string | null = null;
  if (typeof value === 'string') s = value;
  else if (Array.isArray(value) && value[0] && typeof value[0] === 'string') s = value[0];
  if (s == null) return null;
  const trimmed = s.trim();
  return trimmed === '' ? null : trimmed;
}
