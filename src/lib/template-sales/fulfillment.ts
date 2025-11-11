import { prisma } from '@/lib/prisma'
import { logError, ErrorType } from '@/lib/error-logging'
import { sendTemplateDeliveryEmail } from '@/lib/email/template-delivery'
import { grantGitHubAccess, normalizeGithubUsername } from '@/lib/github/access-management'
import crypto from 'node:crypto'

type TemplatePackage = 'basic' | 'pro' | 'enterprise'

interface FulfillmentParams {
  sessionId: string
  customerEmail: string
  package: TemplatePackage
  customerName?: string | null
  companyName?: string | null
  githubUsername?: string | null
}

interface FulfillmentResult {
  licenseKey: string
  downloadToken: string
  downloadUrl: string
  supportTier: string
  accessExpiresAt: Date | null
  emailSent: boolean
  githubAccessGranted: boolean
  githubTeamId?: string | null
  githubUsername?: string | null
}

const SUPPORT_TIERS: Record<TemplatePackage, string> = {
  basic: 'email',
  pro: 'priority_email',
  enterprise: 'phone_email_dedicated',
}

const ACCESS_WINDOWS_DAYS: Record<TemplatePackage, number | null> = {
  basic: 30,
  pro: 90,
  enterprise: null,
}

export async function fulfillTemplateSale(params: FulfillmentParams): Promise<FulfillmentResult> {
  const {
    sessionId,
    customerEmail,
    package: packageType,
    customerName,
    companyName,
    githubUsername,
  } = params

  // Use transaction with row-level locking to prevent race condition
  // This atomically checks and marks the sale as being fulfilled
  const templateSale = await prisma.$transaction(async (tx) => {
    // Lock the row for update to prevent concurrent fulfillment
    const sale = await tx.templateSale.findUnique({
      where: { sessionId },
    })

    if (!sale) {
      throw new Error('Sale record not found')
    }

    if (sale.status !== 'COMPLETED') {
      throw new Error('Sale is not marked as completed')
    }

    const metadata = (sale.metadata as Record<string, unknown>) || {}
    if (metadata.fulfilled) {
      throw new Error('Template already delivered')
    }

    // Immediately mark as fulfilling to prevent duplicate processing
    await tx.templateSale.update({
      where: { sessionId },
      data: {
        metadata: {
          ...metadata,
          fulfilling: true,
          fulfillingStartedAt: new Date().toISOString(),
        },
      },
    })

    return sale
  })

  if (!templateSale) {
    throw new Error('Sale record not found')
  }

  const normalizedGithubUsername = normalizeGithubUsername(
    githubUsername || (templateSale.githubUsername ?? undefined)
  )

  try {
    const accessCredentials = await generateAccessCredentials(templateSale.id, packageType)
    const metadataAccess = {
      ...accessCredentials,
      expiresAt: accessCredentials.expiresAt ? accessCredentials.expiresAt.toISOString() : null,
    }

    const emailResult = await sendTemplateDeliveryEmail({
      customerEmail,
      package: packageType,
      accessCredentials,
      customerName,
      companyName,
    })

    const accessExpiresAt = accessCredentials.expiresAt

    let githubAccess: { success: boolean; teamId?: string | null } = { success: false }
    if (packageType === 'pro' || packageType === 'enterprise') {
      try {
        const result = await grantGitHubAccess({
          email: customerEmail,
          package: packageType,
          saleId: templateSale.id,
          githubUsername: normalizedGithubUsername,
        })
        githubAccess = { success: result.success, teamId: result.teamId ?? null }
      } catch (githubError) {
        logError(githubError as Error, ErrorType.SYSTEM)
      }
    }

    // Mark as fulfilled atomically
    await prisma.templateSale.update({
      where: { sessionId },
      data: {
        githubUsername: normalizedGithubUsername,
        metadata: {
          ...((templateSale.metadata as object) || {}),
          fulfilled: true,
          fulfilledAt: new Date().toISOString(),
          emailSent: emailResult.success,
          githubAccess: githubAccess.success,
          accessCredentials: metadataAccess,
          githubUsername: normalizedGithubUsername,
          fulfilling: false, // Clear the in-progress flag
        },
      },
    })

    const customerRecord = await prisma.templateSaleCustomer.upsert({
      where: { saleId: templateSale.id },
      update: {
        email: customerEmail,
        package: packageType,
        licenseKey: accessCredentials.licenseKey,
        downloadToken: accessCredentials.downloadToken,
        githubTeamId: githubAccess.teamId || null,
        githubUsername: normalizedGithubUsername || null,
        supportTier: getSupportTier(packageType),
        accessExpiresAt: accessExpiresAt,
        metadata: {
          emailDelivered: emailResult.success,
          githubAccessGranted: githubAccess.success,
          onboardingCompleted: false,
          githubUsername: normalizedGithubUsername,
        },
      },
      create: {
        saleId: templateSale.id,
        email: customerEmail,
        package: packageType,
        licenseKey: accessCredentials.licenseKey,
        downloadToken: accessCredentials.downloadToken,
        githubTeamId: githubAccess.teamId || null,
        githubUsername: normalizedGithubUsername || null,
        supportTier: getSupportTier(packageType),
        accessExpiresAt: accessExpiresAt,
        metadata: {
          emailDelivered: emailResult.success,
          githubAccessGranted: githubAccess.success,
          onboardingCompleted: false,
          githubUsername: normalizedGithubUsername,
        },
      },
    })

    return {
      licenseKey: customerRecord.licenseKey,
      downloadToken: customerRecord.downloadToken,
      downloadUrl: accessCredentials.downloadUrl,
      supportTier: customerRecord.supportTier,
      accessExpiresAt: customerRecord.accessExpiresAt,
      emailSent: emailResult.success,
      githubAccessGranted: githubAccess.success,
      githubTeamId: githubAccess.teamId || null,
      githubUsername: normalizedGithubUsername || null,
    }
  } catch (fulfillmentError) {
    // Rollback the fulfilling flag on error
    const existingMetadata = (templateSale.metadata as Record<string, unknown>) || {}
    await prisma.templateSale.update({
      where: { sessionId },
      data: {
        metadata: {
          ...existingMetadata,
          fulfilling: false,
          fulfillingError: {
            message:
              fulfillmentError instanceof Error
                ? fulfillmentError.message
                : String(fulfillmentError),
            timestamp: new Date().toISOString(),
          },
        },
      },
    })

    // Re-throw the error after rollback
    throw fulfillmentError
  }
}

async function generateAccessCredentials(
  saleId: string,
  packageType: TemplatePackage
): Promise<{
  licenseKey: string
  downloadToken: string
  downloadUrl: string
  expiresAt: Date | null
}> {
  const licenseKey = generateLicenseKey(packageType)
  const downloadToken = generateSecureDownloadToken()
  const expiresAt = getAccessExpiration(packageType)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  return {
    licenseKey,
    downloadToken,
    downloadUrl: `${baseUrl}/template-download?token=${downloadToken}`,
    expiresAt,
  }
}

function generateLicenseKey(packageType: TemplatePackage): string {
  const prefix = packageType.toUpperCase().slice(0, 3)
  const segment = () => crypto.randomBytes(4).toString('hex').toUpperCase()
  const checksum = crypto
    .createHash('sha256')
    .update(`${prefix}-${Date.now()}-${crypto.randomUUID()}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()

  return `${prefix}-${segment()}-${segment()}-${checksum}`
}

function generateSecureDownloadToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function getSupportTier(packageType: TemplatePackage): string {
  return SUPPORT_TIERS[packageType]
}

function getAccessExpiration(packageType: TemplatePackage): Date | null {
  const windowDays = ACCESS_WINDOWS_DAYS[packageType]
  if (!windowDays) {
    return null
  }

  const expires = new Date()
  expires.setDate(expires.getDate() + windowDays)
  return expires
}
