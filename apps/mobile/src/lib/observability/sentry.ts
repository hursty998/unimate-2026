import * as Sentry from "@sentry/react-native";
import {
  getConfiguredSentryDsn,
  redactSentryExceptionText,
} from "./sentry-config";

const dsn = getConfiguredSentryDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    enableAutoSessionTracking: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    beforeBreadcrumb() {
      return null;
    },
    beforeSend(event) {
      delete event.user;
      delete event.request;
      delete event.breadcrumbs;
      delete event.extra;
      for (const exception of event.exception?.values ?? []) {
        if (typeof exception.value === "string") {
          exception.value = redactSentryExceptionText(exception.value);
        }
      }
      return event;
    },
  });
}
