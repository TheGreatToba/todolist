/**
 * Configurable set-password token expiry. Extracted for testability.
 * Clamped 1–168h (1 week max), fallback 24h if invalid.
 */
export function getSetPasswordTokenExpiryHours(): number {
  const raw = parseInt(process.env.SET_PASSWORD_TOKEN_EXPIRY_HOURS || "24", 10);
  if (!Number.isFinite(raw) || raw < 1) return 24;
  return Math.min(raw, 168);
}
