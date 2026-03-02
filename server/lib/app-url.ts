/**
 * Base URL for the frontend, used in email links (set-password, reset-password).
 * If the configured URL has no port and PORT is set, the port is appended so links work when the app runs on a non-default port.
 */
export function getFrontendBaseUrl(): string {
  let configured =
    process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:8080";
  configured = configured.replace(/\/$/, "");

  const portEnv = process.env.PORT?.trim();
  const port = portEnv ? parseInt(portEnv, 10) : null;
  if (port != null && Number.isInteger(port) && port > 0 && port <= 65535) {
    try {
      const url = new URL(configured);
      // URL has no explicit port (default 80 for http, 443 for https)
      if (
        url.port === "" &&
        (url.protocol === "http:" || url.protocol === "https:")
      ) {
        url.port = String(port);
        return url.toString().replace(/\/$/, "");
      }
    } catch {
      // ignore invalid URL
    }
  }
  return configured;
}
