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

/**
 * Stable hash of email for correlation in prod (no PII).
 * Uses LOG_HASH_SECRET (separate from JWT for independent rotation).
 * Email is canonicalized (trim + lowerCase) so User@Test.com and user@test.com yield the same hash.
 * Returns undefined if LOG_HASH_SECRET is not set (emailHash is then omitted from logs).
 */
export function emailHashForLog(email: string): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined;
  const secret = process.env.LOG_HASH_SECRET;
  if (!secret) return undefined;
  const canonical = email.trim().toLowerCase();
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex').slice(0, 16);
}
