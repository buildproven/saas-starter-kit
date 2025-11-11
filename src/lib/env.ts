/**
 * Environment Variable Validation
 *
 * Validates all required environment variables at startup using Zod.
 * Prevents runtime crashes from missing or invalid configuration.
 */

import { z } from 'zod'

const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),

  // Authentication
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, 'NEXTAUTH_SECRET must be at least 32 characters for security'),

  // OAuth Providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Stripe (required for billing)
  STRIPE_SECRET_KEY: z
    .string()
    .startsWith('sk_', 'STRIPE_SECRET_KEY must start with sk_')
    .optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
    .string()
    .startsWith('pk_', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must start with pk_')
    .optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .startsWith('whsec_', 'STRIPE_WEBHOOK_SECRET must start with whsec_')
    .optional(),

  // Template Sales (optional feature)
  STRIPE_TEMPLATE_BASIC_PRICE_ID: z.string().optional(),
  STRIPE_TEMPLATE_PRO_PRICE_ID: z.string().optional(),
  STRIPE_TEMPLATE_ENTERPRISE_PRICE_ID: z.string().optional(),
  TEMPLATE_FULFILLMENT_SECRET: z.string().optional(),
  TEMPLATE_FILES_PATH: z.string().optional(),
  TEMPLATE_VERSION: z.string().optional(),

  // App Configuration
  NEXT_PUBLIC_APP_VERSION: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),

  // Sentry (optional monitoring)
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // GitHub (optional template access)
  GITHUB_ACCESS_TOKEN: z.string().optional(),
  GITHUB_ORG: z.string().optional(),

  // Email (optional)
  SENDGRID_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),

  // AWS (optional)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Vercel (optional)
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_ORG_ID: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),

  // Build/Test flags
  SKIP_DB_HEALTHCHECK: z.string().optional(),
  ANALYZE: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

let cachedEnv: Env | null = null

/**
 * Validate environment variables at startup.
 * Exits process with code 1 if validation fails.
 */
export function validateEnv(): Env {
  if (cachedEnv) {
    return cachedEnv
  }

  try {
    cachedEnv = envSchema.parse(process.env)
    return cachedEnv
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment variable validation failed:')
      console.error('')

      for (const issue of error.issues) {
        const path = issue.path.join('.')
        console.error(`  • ${path}: ${issue.message}`)
      }

      console.error('')
      console.error('Please check your .env.local file and ensure all required variables are set.')
      console.error('Refer to .env.example for the complete list of variables.')
    } else {
      console.error('❌ Environment validation error:', error)
    }

    process.exit(1)
  }
}

/**
 * Get validated environment variables.
 * Call validateEnv() first during app initialization.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    throw new Error('Environment not validated. Call validateEnv() during app initialization.')
  }
  return cachedEnv
}

/**
 * Clear cached environment (for testing only)
 */
export function clearEnvCache(): void {
  cachedEnv = null
}

/**
 * Check if a feature is enabled based on environment configuration.
 */
export function isFeatureEnabled(feature: 'template_sales' | 'sentry' | 'github_access'): boolean {
  const env = getEnv()

  switch (feature) {
    case 'template_sales':
      return !!(
        env.STRIPE_TEMPLATE_BASIC_PRICE_ID &&
        env.STRIPE_TEMPLATE_PRO_PRICE_ID &&
        env.STRIPE_TEMPLATE_ENTERPRISE_PRICE_ID
      )
    case 'sentry':
      return !!env.NEXT_PUBLIC_SENTRY_DSN
    case 'github_access':
      return !!(env.GITHUB_ACCESS_TOKEN && env.GITHUB_ORG)
    default:
      return false
  }
}

// Validate on module load in non-test environments
if (process.env.NODE_ENV !== 'test') {
  validateEnv()
}
