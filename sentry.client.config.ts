import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance Monitoring - lower rate in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Release Tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'development',

  // Debug mode only in development
  debug: process.env.NODE_ENV === 'development',

  // Session Replay - privacy-friendly settings
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0.1,

  integrations: [
    Sentry.replayIntegration({
      // Mask sensitive data for privacy
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out common noise and privacy-sensitive errors
  beforeSend(event) {
    // Filter out script errors from browser extensions/bots
    if (event.exception) {
      const exception = event.exception.values?.[0]
      if (exception?.value?.includes('Script error')) {
        return null
      }
      // Filter out common promise rejection spam
      if (exception?.value?.includes('Non-Error promise rejection captured')) {
        return null
      }
      // Filter out network errors that are outside our control
      if (exception?.value?.includes('Network Error') ||
          exception?.value?.includes('Failed to fetch')) {
        return null
      }
    }

    // Filter out NextAuth CSRF errors (these are handled gracefully)
    if (event.message?.includes('NEXTAUTH_') ||
        event.message?.includes('csrf')) {
      return null
    }

    return event
  },

  // Set initial scope with useful context
  initialScope: {
    tags: {
      component: 'client',
      framework: 'nextjs',
    },
  },
})