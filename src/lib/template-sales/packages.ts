export const TEMPLATE_PACKAGE_IDS = ['hobby', 'pro', 'director'] as const

export type TemplatePackage = (typeof TEMPLATE_PACKAGE_IDS)[number]

export interface TemplatePackageDefinition {
  id: TemplatePackage
  name: string
  priceInCents: number
  displayPrice: string
  description: string
  features: readonly string[]
  supportTier: string
  includesGitHubAccess: boolean
}

export const TEMPLATE_PACKAGES: Record<TemplatePackage, TemplatePackageDefinition> = {
  hobby: {
    id: 'hobby',
    name: 'Hobby',
    priceInCents: 9900,
    displayPrice: '$99',
    description: 'Perfect for solo developers and small projects',
    features: [
      'Complete Next.js 16 SaaS template',
      'Authentication and authorization system',
      'Multi-tenant architecture',
      'Stripe billing integration',
      'Comprehensive documentation',
      'Community support',
      'Lifetime updates',
    ],
    supportTier: 'community',
    includesGitHubAccess: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceInCents: 24900,
    displayPrice: '$249',
    description: 'For serious developers and growing teams',
    features: [
      'Everything in Hobby',
      'White-label customization rights',
      'Priority email support',
      'GitHub repository access',
      'Lifetime updates',
    ],
    supportTier: 'priority_email',
    includesGitHubAccess: true,
  },
  director: {
    id: 'director',
    name: 'Director',
    priceInCents: 39900,
    displayPrice: '$399',
    description: 'For founders who want extra support',
    features: [
      'Everything in Pro',
      'Three months of Vibe Lab Pro access',
      'One-hour consultation call',
      'Priority support',
    ],
    supportTier: 'priority_email',
    includesGitHubAccess: true,
  },
}

export function isTemplatePackage(value: string): value is TemplatePackage {
  return TEMPLATE_PACKAGE_IDS.includes(value as TemplatePackage)
}

export function getTemplatePackagePriceId(packageId: TemplatePackage): string | undefined {
  switch (packageId) {
    case 'hobby':
      return process.env.STRIPE_TEMPLATE_HOBBY_PRICE_ID
    case 'pro':
      return process.env.STRIPE_TEMPLATE_PRO_PRICE_ID
    case 'director':
      return process.env.STRIPE_TEMPLATE_DIRECTOR_PRICE_ID
  }
}

export function isTemplateSalesConfigured(): boolean {
  return TEMPLATE_PACKAGE_IDS.every((packageId) => Boolean(getTemplatePackagePriceId(packageId)))
}
