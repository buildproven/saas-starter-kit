import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Performance Monitoring - configured via tracesSampler below

  // Release Tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'development',

  // Debug mode only in development
  debug: process.env.NODE_ENV === 'development',

  // Server-specific error filtering
  beforeSend(event) {
    // Filter out database connection errors during development
    if (process.env.NODE_ENV === 'development') {
      if (event.exception?.values?.[0]?.value?.includes('ECONNREFUSED') ||
          event.exception?.values?.[0]?.value?.includes('database')) {
        return null
      }
    }

    // Filter out NextAuth internal errors that are handled
    if (event.exception?.values?.[0]?.value?.includes('NEXTAUTH_') ||
        event.logger === 'next-auth') {
      return null
    }

    return event
  },

  // Set initial scope with server context
  initialScope: {
    tags: {
      component: 'server',
      framework: 'nextjs',
    },
  },

  // Enhanced error context for server requests
  integrations: [
    Sentry.httpIntegration(),
  ],

  // Configure tracing
  tracesSampler: (samplingContext) => {
    // Don't trace health checks, static assets, etc.
    const pathname = samplingContext.request?.url
    if (pathname?.includes('/_next/') ||
        pathname?.includes('/api/health') ||
        pathname?.includes('/favicon')) {
      return 0
    }
    return process.env.NODE_ENV === 'production' ? 0.05 : 1.0
  },
})