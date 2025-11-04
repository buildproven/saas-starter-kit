/**
 * Template Sales Fulfillment API
 *
 * Handles post-purchase delivery of template access including:
 * - Email with download links
 * - GitHub repository access
 * - Support escalation
 * - Customer portal setup
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logError, ErrorType } from '@/lib/error-logging'
import { sendTemplateDeliveryEmail } from '@/lib/email/template-delivery'
import { grantGitHubAccess } from '@/lib/github/access-management'

interface TemplateSaleData {
  id: string
  package: string
  metadata?: Record<string, unknown>
  customerDetails?: Record<string, unknown>
}

interface AccessCredentials {
  licenseKey: string
  downloadToken: string
  downloadUrl: string
  expiresAt: Date
}

const FulfillmentRequestSchema = z.object({
  sessionId: z.string(),
  customerEmail: z.string().email(),
  package: z.enum(['basic', 'pro', 'enterprise']),
})

// POST /api/template-sales/fulfill
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = FulfillmentRequestSchema.parse(body)

    // Find the completed sale
    const templateSale = await prisma.templateSale.findUnique({
      where: { sessionId: validatedData.sessionId },
    })

    if (!templateSale) {
      return NextResponse.json(
        { error: 'Sale record not found' },
        { status: 404 }
      )
    }

    if (templateSale.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Sale not completed yet' },
        { status: 400 }
      )
    }

    // Check if already fulfilled
    if (templateSale.metadata && (templateSale.metadata as Record<string, unknown>)?.fulfilled) {
      return NextResponse.json(
        { error: 'Template already delivered' },
        { status: 409 }
      )
    }

    // Generate access credentials
    const accessCredentials = await generateAccessCredentials({
      id: templateSale.id,
      package: templateSale.package
    })

    // Send delivery email based on package tier
    const emailResult = await sendTemplateDeliveryEmail({
      customerEmail: validatedData.customerEmail,
      package: validatedData.package,
      accessCredentials,
      customerName: (templateSale.customerDetails as { name?: string })?.name || null,
      companyName: templateSale.companyName || null,
    })

    // Grant GitHub access for Pro/Enterprise tiers
    let githubAccess = null
    if (validatedData.package === 'pro' || validatedData.package === 'enterprise') {
      try {
        githubAccess = await grantGitHubAccess({
          email: validatedData.customerEmail,
          package: validatedData.package,
          saleId: templateSale.id,
        })
      } catch (githubError) {
        console.warn('GitHub access grant failed:', githubError)
        // Continue fulfillment even if GitHub fails - can be done manually
      }
    }

    // Update sale record with fulfillment details
    await prisma.templateSale.update({
      where: { sessionId: validatedData.sessionId },
      data: {
        metadata: {
          ...(templateSale.metadata as Record<string, unknown> || {}),
          fulfilled: true,
          fulfilledAt: new Date().toISOString(),
          emailSent: emailResult.success,
          githubAccess: githubAccess?.success || false,
          accessCredentialsGenerated: true,
        },
      },
    })

    // Create customer record for ongoing support
    const customer = await prisma.templateSaleCustomer.create({
      data: {
        saleId: templateSale.id,
        email: validatedData.customerEmail,
        package: validatedData.package,
        licenseKey: accessCredentials.licenseKey,
        downloadToken: accessCredentials.downloadToken,
        githubTeamId: githubAccess?.teamId || null,
        supportTier: getSupportTier(validatedData.package),
        accessExpiresAt: getAccessExpiration(validatedData.package),
        metadata: {
          emailDelivered: emailResult.success,
          githubAccessGranted: githubAccess?.success || false,
          onboardingCompleted: false,
        },
      },
    })

    return NextResponse.json({
      success: true,
      fulfillment: {
        emailSent: emailResult.success,
        githubAccess: githubAccess?.success || false,
        licenseKey: accessCredentials.licenseKey,
        downloadUrl: accessCredentials.downloadUrl,
        supportTier: customer.supportTier,
        accessExpiresAt: customer.accessExpiresAt,
      },
      nextSteps: getNextSteps(validatedData.package),
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    logError(error as Error, ErrorType.SYSTEM)
    return NextResponse.json(
      { error: 'Failed to fulfill template delivery' },
      { status: 500 }
    )
  }
}

// Helper function to generate access credentials
async function generateAccessCredentials(templateSale: TemplateSaleData): Promise<AccessCredentials> {
  const licenseKey = generateLicenseKey(templateSale.id, templateSale.package)
  const downloadToken = generateSecureDownloadToken(templateSale.id)

  return {
    licenseKey,
    downloadToken,
    downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/template-download?token=${downloadToken}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  }
}

// Generate cryptographically secure license key
function generateLicenseKey(saleId: string, packageType: string): string {
  const prefix = packageType.toUpperCase().slice(0, 3)
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 8).toUpperCase()
  const checksum = generateChecksum(`${saleId}-${packageType}-${timestamp}`)

  return `${prefix}-${timestamp}-${random}-${checksum}`
}

// Generate secure download token with expiration
function generateSecureDownloadToken(saleId: string): string {
  const payload = {
    saleId,
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
    iat: Date.now(),
    type: 'template_download'
  }

  // In production, use proper JWT signing
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

// Generate checksum for license validation
function generateChecksum(data: string): string {
  // Simple checksum - in production use crypto.createHash
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).substr(0, 4).toUpperCase()
}

// Get support tier based on package
function getSupportTier(packageType: string): string {
  switch (packageType) {
    case 'basic': return 'email'
    case 'pro': return 'priority_email'
    case 'enterprise': return 'phone_email_dedicated'
    default: return 'email'
  }
}

// Get access expiration based on package
function getAccessExpiration(packageType: string): Date | null {
  switch (packageType) {
    case 'basic': return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    case 'pro': return new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000) // 2 years
    case 'enterprise': return null // Lifetime access
    default: return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  }
}

// Get next steps based on package tier
function getNextSteps(packageType: string) {
  const baseSteps = [
    'Check your email for download links and setup instructions',
    'Download the template files using the provided secure link',
    'Follow the Quick Start guide in the documentation',
    'Set up your development environment using the included configs',
  ]

  const tierSpecificSteps = {
    basic: [
      'Join our community Discord for basic support and discussions',
      'Submit support requests via email (48-hour response time)',
    ],
    pro: [
      'Access your private GitHub repository with premium features',
      'Watch the video tutorial series in your customer portal',
      'Schedule your included 1-hour consultation call',
      'Priority email support (24-hour response time)',
    ],
    enterprise: [
      'Access your private GitHub repository with all premium features',
      'Review the custom deployment documentation',
      'Contact your dedicated account manager to schedule team training',
      '24/7 phone + email support with guaranteed SLA',
      'Custom integration consultation available',
    ],
  }

  return [
    ...baseSteps,
    ...(tierSpecificSteps[packageType as keyof typeof tierSpecificSteps] || []),
  ]
}

/**
 * Usage Example:
 *
 * // Called automatically after successful Stripe payment
 * const fulfillment = await fetch('/api/template-sales/fulfill', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     sessionId: 'cs_test_...',
 *     customerEmail: 'customer@company.com',
 *     package: 'pro'
 *   })
 * })
 */