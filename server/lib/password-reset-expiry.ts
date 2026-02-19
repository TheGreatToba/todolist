/**
 * Configurable password reset token expiry. Extracted for testability.
 * Clamped 1–24h (24h max), fallback 1h if invalid.
 */
export function getPasswordResetTokenExpiryHours(): number {
  const raw = parseInt(
    process.env.PASSWORD_RESET_TOKEN_EXPIRY_HOURS || "1",
    10,
  );
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, 24);
}
