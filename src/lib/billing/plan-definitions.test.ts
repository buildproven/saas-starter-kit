/**
 * Tests for Plan Definitions
 */

import {
  PLAN_VARIANTS,
  getPlanLabel,
  getPriceIdFromEnv,
  getPlanNameByPriceId,
} from './plan-definitions'

describe('Plan Definitions', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe('PLAN_VARIANTS', () => {
    it('contains all plan tiers', () => {
      const tiers = new Set(PLAN_VARIANTS.map((v) => v.tier))
      expect(tiers).toContain('starter')
      expect(tiers).toContain('pro')
      expect(tiers).toContain('enterprise')
    })

    it('contains monthly and yearly variants for each tier', () => {
      const starterVariants = PLAN_VARIANTS.filter((v) => v.tier === 'starter')
      expect(starterVariants).toHaveLength(2)
      expect(starterVariants.map((v) => v.interval)).toContain('month')
      expect(starterVariants.map((v) => v.interval)).toContain('year')
    })

    it('has correct price env keys for starter tier', () => {
      const starterMonthly = PLAN_VARIANTS.find(
        (v) => v.tier === 'starter' && v.interval === 'month'
      )
      const starterYearly = PLAN_VARIANTS.find(
        (v) => v.tier === 'starter' && v.interval === 'year'
      )

      expect(starterMonthly?.priceEnv).toBe('STRIPE_PRICE_STARTER_MONTHLY')
      expect(starterYearly?.priceEnv).toBe('STRIPE_PRICE_STARTER_YEARLY')
    })

    it('has correct labels with tier and interval', () => {
      const proMonthly = PLAN_VARIANTS.find((v) => v.tier === 'pro' && v.interval === 'month')
      expect(proMonthly?.label).toBe('Pro (Monthly)')
    })
  })

  describe('getPlanLabel', () => {
    it('returns correct label for starter', () => {
      expect(getPlanLabel('starter')).toBe('Starter')
    })

    it('returns correct label for pro', () => {
      expect(getPlanLabel('pro')).toBe('Pro')
    })

    it('returns correct label for enterprise', () => {
      expect(getPlanLabel('enterprise')).toBe('Enterprise')
    })
  })

  describe('getPriceIdFromEnv', () => {
    it('returns env value when set', () => {
      process.env.STRIPE_PRICE_TEST = 'price_123'
      expect(getPriceIdFromEnv('STRIPE_PRICE_TEST')).toBe('price_123')
    })

    it('returns null when env is not set', () => {
      delete process.env.STRIPE_PRICE_NOT_SET
      expect(getPriceIdFromEnv('STRIPE_PRICE_NOT_SET')).toBeNull()
    })

    it('returns null when env is empty string', () => {
      process.env.STRIPE_PRICE_EMPTY = ''
      expect(getPriceIdFromEnv('STRIPE_PRICE_EMPTY')).toBeNull()
    })

    it('returns null when env is whitespace only', () => {
      process.env.STRIPE_PRICE_WHITESPACE = '   '
      expect(getPriceIdFromEnv('STRIPE_PRICE_WHITESPACE')).toBeNull()
    })

    it('trims whitespace from env values', () => {
      process.env.STRIPE_PRICE_PADDED = '  price_456  '
      expect(getPriceIdFromEnv('STRIPE_PRICE_PADDED')).toBe('price_456')
    })
  })

  describe('getPlanNameByPriceId', () => {
    it('returns plan label when price ID matches', () => {
      process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_monthly'
      expect(getPlanNameByPriceId('price_starter_monthly')).toBe('Starter (Monthly)')
    })

    it('returns undefined when price ID does not match', () => {
      expect(getPlanNameByPriceId('price_unknown')).toBeUndefined()
    })

    it('matches yearly variant', () => {
      process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_yearly'
      expect(getPlanNameByPriceId('price_pro_yearly')).toBe('Pro (Yearly)')
    })

    it('matches enterprise variant', () => {
      process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = 'price_ent_monthly'
      expect(getPlanNameByPriceId('price_ent_monthly')).toBe('Enterprise (Monthly)')
    })
  })
})
