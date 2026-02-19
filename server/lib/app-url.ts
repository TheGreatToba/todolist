export function getFrontendBaseUrl(): string {
  const configured =
    process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:8080";
  return configured.replace(/\/$/, "");
}
