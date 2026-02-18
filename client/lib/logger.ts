const isDev = import.meta.env.DEV;

type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => {
    if (isDev) {
      console.debug(...args);
    }
  },
  info: (...args: LogArgs) => {
    if (isDev) {
      console.info(...args);
    }
  },
  warn: (...args: LogArgs) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: LogArgs) => {
    // Always log errors in the console
    console.error(...args);
  },
};
