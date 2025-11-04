import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withSuperAdminAuth, type AuthenticatedUser } from '@/lib/auth/api-protection'
import { prisma } from '@/lib/prisma'
import { grantGitHubAccess, normalizeGithubUsername } from '@/lib/github/access-management'

const githubUsernameRegex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

const OverrideSchema = z
  .object({
    saleId: z.string().trim().optional(),
    customerEmail: z.string().email().optional(),
    githubUsername: z
      .string()
      .min(1)
      .max(39)
      .regex(
        githubUsernameRegex,
        'GitHub username must be 1-39 characters using letters, numbers, or single hyphens'
      ),
    retry: z.boolean().optional(),
  })
  .refine((data) => data.saleId || data.customerEmail, {
    message: 'Provide either saleId or customerEmail',
    path: ['saleId'],
  })

type AuthContext = { user: AuthenticatedUser | null }

async function postHandler(request: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  try {
    const body = await request.json()
    const parsed = OverrideSchema.parse(body)

    const normalizedUsername = normalizeGithubUsername(parsed.githubUsername)
    if (!normalizedUsername) {
      return NextResponse.json(
        { error: 'Unable to normalize GitHub username. Check formatting and try again.' },
        { status: 400 }
      )
    }

    const sale = await locateSale(parsed.saleId, parsed.customerEmail)
    if (!sale) {
      return NextResponse.json({ error: 'Template sale not found' }, { status: 404 })
    }

    const customerEmail = sale.customer?.email ?? sale.email
    const metadata = (sale.metadata as Record<string, unknown>) || {}
    const overrideInfo = {
      username: normalizedUsername,
      overriddenAt: new Date().toISOString(),
      overriddenBy: user?.email ?? 'system',
    }

    await prisma.templateSale.update({
      where: { id: sale.id },
      data: {
        githubUsername: normalizedUsername,
        metadata: {
          ...metadata,
          githubUsername: normalizedUsername,
          githubOverride: overrideInfo,
        },
      },
    })

    if (sale.customer) {
      await prisma.templateSaleCustomer.update({
        where: { saleId: sale.id },
        data: {
          githubUsername: normalizedUsername,
          metadata: {
            ...((sale.customer.metadata as Record<string, unknown> | null) ?? {}),
            githubUsername: normalizedUsername,
            githubOverride: overrideInfo,
          },
        },
      })
    }

    let invitationResult: Awaited<ReturnType<typeof grantGitHubAccess>> | null = null
    const shouldRetry = parsed.retry !== false && sale.package !== 'basic'

    if (shouldRetry) {
      invitationResult = await grantGitHubAccess({
        email: customerEmail,
        package: sale.package as 'basic' | 'pro' | 'enterprise',
        saleId: sale.id,
        githubUsername: normalizedUsername,
      })
    }

    return NextResponse.json({
      saleId: sale.id,
      customerEmail,
      githubUsername: normalizedUsername,
      retried: shouldRetry,
      invitation: invitationResult,
      message: invitationResult?.success
        ? 'GitHub invitation sent successfully'
        : shouldRetry
          ? (invitationResult?.error ?? 'GitHub invitation retry attempted')
          : 'GitHub username updated without retry',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    console.error('GitHub override error:', error)
    return NextResponse.json({ error: 'Failed to update GitHub access' }, { status: 500 })
  }
}

async function locateSale(saleId?: string, customerEmail?: string) {
  if (saleId) {
    const sale = await prisma.templateSale.findUnique({
      where: { id: saleId },
      include: { customer: true },
    })
    if (sale) {
      return sale
    }
  }

  if (customerEmail) {
    return prisma.templateSale.findFirst({
      where: {
        OR: [{ email: customerEmail }, { customer: { email: customerEmail } }],
      },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  return null
}

export const POST = withSuperAdminAuth(postHandler)

export { postHandler as postGithubOverrideHandler }
