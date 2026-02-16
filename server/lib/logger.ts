type LogArgs = unknown[];

const isProd = process.env.NODE_ENV === 'production';

// No-op function for disabled levels
const noop = () => {};

export const logger = {
  // Debug logs are suppressed in production by default
  debug: (...args: LogArgs) => {
    if (!isProd) {
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
};

