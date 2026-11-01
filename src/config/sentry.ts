import * as Sentry from '@sentry/react-native';

// Only initializes when EXPO_PUBLIC_SENTRY_DSN is set (see .env.example) —
// without it, Sentry.wrap()/captureException/captureMessage calls elsewhere
// in the app remain safe no-ops, so this is inert until a DSN is configured.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({ dsn });
}
