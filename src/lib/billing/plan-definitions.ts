export type PlanTier = 'starter' | 'pro' | 'enterprise'
export type BillingIntervalSlug = 'month' | 'year'

interface PlanVariantDefinition {
  tier: PlanTier
  interval: BillingIntervalSlug
  priceEnv: string
  label: string
}

const PLAN_LABELS: Record<PlanTier, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export const PLAN_VARIANTS: ReadonlyArray<PlanVariantDefinition> = [
  {
    tier: 'starter',
    interval: 'month',
    priceEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
    label: `${PLAN_LABELS.starter} (Monthly)`,
  },
  {
    tier: 'starter',
    interval: 'year',
    priceEnv: 'STRIPE_PRICE_STARTER_YEARLY',
    label: `${PLAN_LABELS.starter} (Yearly)`,
  },
  {
    tier: 'pro',
    interval: 'month',
    priceEnv: 'STRIPE_PRICE_PRO_MONTHLY',
    label: `${PLAN_LABELS.pro} (Monthly)`,
  },
  {
    tier: 'pro',
    interval: 'year',
    priceEnv: 'STRIPE_PRICE_PRO_YEARLY',
    label: `${PLAN_LABELS.pro} (Yearly)`,
  },
  {
    tier: 'enterprise',
    interval: 'month',
    priceEnv: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
    label: `${PLAN_LABELS.enterprise} (Monthly)`,
  },
  {
    tier: 'enterprise',
    interval: 'year',
    priceEnv: 'STRIPE_PRICE_ENTERPRISE_YEARLY',
    label: `${PLAN_LABELS.enterprise} (Yearly)`,
  },
]

export function getPlanLabel(tier: PlanTier): string {
  return PLAN_LABELS[tier]
}

export function getPriceIdFromEnv(priceEnv: string): string | null {
  const value = process.env[priceEnv]?.trim()
  return value && value.length > 0 ? value : null
}

export function getPlanNameByPriceId(priceId: string): string | undefined {
  for (const variant of PLAN_VARIANTS) {
    const configuredPriceId = getPriceIdFromEnv(variant.priceEnv)
    if (configuredPriceId === priceId) {
      return variant.label
    }
  }

  return undefined
}
