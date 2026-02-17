import crypto from 'crypto';

/**
 * Redact email for production logs (GDPR/SIEM): keep domain only, mask local part.
 * In non-production returns the email as-is for easier debugging.
 */
export function redactEmailForLog(email: string): string {
  if (process.env.NODE_ENV !== 'production') return email;
  const at = email.indexOf('@');
  return at >= 0 ? `***@${email.slice(at + 1)}` : '***';
}

const EMAIL_HASH_VERSION = 'v1';
const EMAIL_HASH_HEX_LEN = 24; // 96 bits; reduces collision risk for high volume / long-term correlation

/** Regex for the current emailHash format (version + hex). Use in tests to avoid scattering magic strings. */
export const EMAIL_HASH_FORMAT_REGEX = new RegExp(`^${EMAIL_HASH_VERSION}_[a-f0-9]{${EMAIL_HASH_HEX_LEN}}$`);

/**
 * Stable hash of email for correlation in prod (no PII).
 * Uses LOG_HASH_SECRET (separate from JWT for independent rotation).
 * Leading/trailing whitespace in LOG_HASH_SECRET is trimmed before use.
 * Email is canonicalized (trim + lowerCase) so User@Test.com and user@test.com yield the same hash.
 * Returns undefined if LOG_HASH_SECRET is not set or empty after trim (emailHash is then omitted from logs).
 * Format: "v1_<24 hex chars>" so future algo/rotation can use v2_... without ambiguity.
 */
export function emailHashForLog(email: string): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined;
  const secret = process.env.LOG_HASH_SECRET?.trim();
  if (!secret) return undefined;
  const canonical = email.trim().toLowerCase();
  const raw = crypto.createHmac('sha256', secret).update(canonical).digest('hex').slice(0, EMAIL_HASH_HEX_LEN);
  return `${EMAIL_HASH_VERSION}_${raw}`;
}
