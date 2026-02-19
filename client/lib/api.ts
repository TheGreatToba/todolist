/**
 * API client with CSRF token support for state-changing requests.
 * Reads csrf-token from cookie (set by server on GET /api/auth/profile) and adds X-CSRF-TOKEN header.
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/csrf-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Centralized GET with credentials. Use for all read-only API calls. Body is ignored to avoid accidental GET with body. */
export function apiGet(url: string, init?: RequestInit): Promise<Response> {
  const { body: _body, method: _method, ...rest } = init ?? {};
  void _body;
  void _method;
  return fetch(url, { ...rest, method: "GET", credentials: "include" });
}

export const api = {
  get: apiGet,
};

/** Extract a user-facing error message from a failed Response. Tries JSON .error/.message, then body text, then statusText. */
export async function parseApiError(res: Response): Promise<string> {
  const text = await res.text().catch(() => res.statusText);
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    if (typeof data?.error === "string" && data.error.trim())
      return data.error.trim();
    if (typeof data?.message === "string" && data.message.trim())
      return data.message.trim();
  } catch {
    // not JSON
  }
  return text?.trim() || res.statusText || "Request failed";
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
