/**
 * Normalizes Express route param (string | string[] | ParsedQs | undefined) to a single string or null.
 */
export function paramString(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (Array.isArray(value) && value[0] && typeof value[0] === 'string') return value[0];
  return null;
}
