/**
 * API client with CSRF token support for state-changing requests.
 * Reads csrf-token from cookie (set by server on GET /api/auth/profile) and adds X-CSRF-TOKEN header.
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function fetchWithCsrf(
  url: string,
  options: RequestInit & { method?: string } = {},
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const headers = new Headers(options.headers);
  if (needsCsrf) {
    const token = getCsrfToken();
    if (token) headers.set("X-CSRF-TOKEN", token);
  }
  return fetch(url, { ...options, headers, credentials: "include" });
}
