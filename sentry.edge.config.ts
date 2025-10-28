import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Very low sample rate for edge runtime due to performance constraints
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0.1,

  // Release Tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'development',

  // Debug mode only in development
  debug: process.env.NODE_ENV === 'development',

  // Edge-specific error filtering
  beforeSend(event) {
    // Filter out middleware timeout errors
    if (event.exception?.values?.[0]?.value?.includes('timeout') ||
        event.exception?.values?.[0]?.value?.includes('edge')) {
      return null
    }

    return event
  },

  // Set initial scope with edge context
  initialScope: {
    tags: {
      component: 'edge',
      framework: 'nextjs',
    },
  },
})