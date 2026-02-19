/**
 * CSP helpers for Content-Security-Policy headers.
 * script-src: 'unsafe-inline' only in development (Vite HMR); in prod/test keep 'self' for XSS protection.
 */

export function getCspScriptSrc(env: string): string[] {
  const isDev = env === "development";
  return isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"];
}
