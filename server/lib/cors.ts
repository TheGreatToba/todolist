/**
 * CORS configuration per environment.
 * In production, use ALLOWED_ORIGINS (comma-separated) to whitelist origins.
 * In development, permits localhost origins.
 */
function getAllowedOrigins(): string[] | true {
  const origins = process.env.ALLOWED_ORIGINS;
  if (origins) {
    return origins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  if (process.env.NODE_ENV === "production") {
    return []; // No origins = reject all in prod if not configured
  }
  // Development: allow common dev origins
  return true;
}

export function getCorsOptions() {
  const origin = getAllowedOrigins();
  return {
    origin: Array.isArray(origin) && origin.length === 0 ? false : origin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  };
}

/** Socket.IO CORS: same origin logic as HTTP */
export function getSocketCorsOrigin(): string | string[] {
  const origins = getAllowedOrigins();
  if (origins === true) return "*";
  if (Array.isArray(origins) && origins.length === 0) return [];
  return origins;
}
