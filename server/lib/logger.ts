type LogArgs = unknown[];

/** Read at call time so NODE_ENV changes (e.g. in tests) are respected. */
function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Payload for structured logs (object native, serialized at transport for observability). */
export type StructuredPayload = Record<string, unknown>;

export const logger = {
  // Debug logs are suppressed in production by default
  debug: (...args: LogArgs) => {
    if (!isProd()) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  },
  info: (...args: LogArgs) => {
    // eslint-disable-next-line no-console
    console.info(...args);
  },
  warn: (...args: LogArgs) => {
    // eslint-disable-next-line no-console
    console.warn(...args);
  },
  error: (...args: LogArgs) => {
    // eslint-disable-next-line no-console
    console.error(...args);
  },
  /** Log a structured object as JSON (single line); serialization at transport for search/observability. */
  structured: (
    level: "info" | "warn" | "error",
    payload: StructuredPayload,
  ) => {
    const line = JSON.stringify(payload);
    if (level === "info") {
      // eslint-disable-next-line no-console
      console.info(line);
    } else if (level === "warn") {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.error(line);
    }
  },
};
