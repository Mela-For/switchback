import * as Sentry from '@sentry/react-native';

/**
 * Thin wrapper around console.log/error: logs to the device console only in
 * dev builds (silent in production), and always forwards errors to Sentry.
 * Sentry.captureException/captureMessage are safe no-ops if Sentry.init()
 * was never called (see src/config/sentry.ts), so this works whether or not
 * EXPO_PUBLIC_SENTRY_DSN is configured.
 */
function log(...args: unknown[]): void {
  if (__DEV__) {
    console.log(...args);
  }
}

function error(message: string, err?: unknown): void {
  if (__DEV__) {
    console.error(message, err);
  }
  if (err instanceof Error) {
    Sentry.captureException(err, { extra: { message } });
  } else {
    Sentry.captureMessage(message, { level: 'error', extra: { err } });
  }
}

export const logger = { log, error };
