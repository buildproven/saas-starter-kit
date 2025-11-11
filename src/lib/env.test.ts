import { validateEnv, isFeatureEnabled, clearEnvCache } from './env'

describe('env validation', () => {
  const originalEnv = process.env
  const originalExit = process.exit

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv }

    // Mock process.exit to prevent tests from exiting
    process.exit = jest.fn() as never

    // Clear the cache before each test
    clearEnvCache()

    // Set minimum required variables
    process.env.NODE_ENV = 'test'
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test'
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.NEXTAUTH_SECRET = 'this-is-a-very-long-secret-at-least-32-characters-long'
  })

  afterEach(() => {
    process.env = originalEnv
    process.exit = originalExit
    clearEnvCache()
  })

  describe('validateEnv', () => {
    it('passes with all required variables', () => {
      expect(() => validateEnv()).not.toThrow()
    })

    it('fails when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL

      validateEnv()

      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('fails when DATABASE_URL is not a valid URL', () => {
      process.env.DATABASE_URL = 'not-a-url'

      validateEnv()

      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('fails when NEXTAUTH_SECRET is too short', () => {
      process.env.NEXTAUTH_SECRET = 'short'

      validateEnv()

      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('fails when NEXTAUTH_URL is not a URL', () => {
      process.env.NEXTAUTH_URL = 'not-a-url'

      validateEnv()

      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('validates STRIPE_SECRET_KEY format when provided', () => {
      process.env.STRIPE_SECRET_KEY = 'invalid_format'

      validateEnv()

      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('accepts valid STRIPE_SECRET_KEY', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890'

      expect(() => validateEnv()).not.toThrow()
    })

    it('accepts valid Stripe publishable key', () => {
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_1234567890'

      expect(() => validateEnv()).not.toThrow()
    })

    it('fails on invalid Stripe publishable key format', () => {
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'invalid_1234'

      validateEnv()

      expect(process.exit).toHaveBeenCalledWith(1)
    })

    it('accepts valid Stripe webhook secret', () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_1234567890'

      expect(() => validateEnv()).not.toThrow()
    })

    it('caches validation result', () => {
      const result1 = validateEnv()
      const result2 = validateEnv()

      expect(result1).toBe(result2) // Same object reference
    })

    it('provides all validated environment variables', () => {
      const env = validateEnv()

      expect(env.NODE_ENV).toBe('test')
      expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/test')
      expect(env.NEXTAUTH_URL).toBe('http://localhost:3000')
    })
  })

  describe('isFeatureEnabled', () => {
    it('returns false for template_sales when not configured', () => {
      validateEnv() // Must validate first
      expect(isFeatureEnabled('template_sales')).toBe(false)
    })

    it('returns true for template_sales when fully configured', () => {
      process.env.STRIPE_TEMPLATE_BASIC_PRICE_ID = 'price_basic'
      process.env.STRIPE_TEMPLATE_PRO_PRICE_ID = 'price_pro'
      process.env.STRIPE_TEMPLATE_ENTERPRISE_PRICE_ID = 'price_enterprise'

      clearEnvCache()
      validateEnv()

      expect(isFeatureEnabled('template_sales')).toBe(true)
    })

    it('returns false for sentry when SENTRY_DSN not set', () => {
      validateEnv()
      expect(isFeatureEnabled('sentry')).toBe(false)
    })

    it('returns true for sentry when SENTRY_DSN is set', () => {
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://sentry.io/123'

      clearEnvCache()
      validateEnv()

      expect(isFeatureEnabled('sentry')).toBe(true)
    })

    it('returns false for github_access when not configured', () => {
      validateEnv()
      expect(isFeatureEnabled('github_access')).toBe(false)
    })

    it('returns true for github_access when configured', () => {
      process.env.GITHUB_ACCESS_TOKEN = 'ghp_1234567890'
      process.env.GITHUB_ORG = 'my-org'

      clearEnvCache()
      validateEnv()

      expect(isFeatureEnabled('github_access')).toBe(true)
    })
  })
})
