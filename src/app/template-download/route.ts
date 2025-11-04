/**
 * Template Download API
 *
 * Secure download endpoint that validates tokens and provides
 * time-limited access to template files based on purchase tier.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logError, ErrorType } from '@/lib/error-logging'
import { rateLimit } from '@/lib/auth/api-protection'
import type { TemplateSaleCustomer as TemplateSaleCustomerModel } from '@prisma/client'
import { DownloadStatus } from '@prisma/client'

interface DownloadResult {
  fileBuffer: Buffer
  contentType: string
  filename: string
}

const DownloadRequestSchema = z.object({
  token: z.string(),
  format: z.enum(['zip', 'tar']).optional().default('zip'),
})

type ValidatedCustomer = TemplateSaleCustomerModel & {
  sale: {
    id: string
    status: string
  }
}

type TokenValidationResult =
  | { valid: true; customer: ValidatedCustomer }
  | { valid: false; error: string; status: number }

// GET /template-download?token=...&format=zip
export async function GET(request: NextRequest) {
  const ipAddress = getClientIP(request)
  const userAgent = request.headers.get('user-agent') || ''
  let parsedRequest: { token: string; format: 'zip' | 'tar' } | null = null

  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const format = url.searchParams.get('format') || 'zip'

    const validatedData = DownloadRequestSchema.parse({ token, format })
    parsedRequest = validatedData

    const rateLimitKey = `${ipAddress}:${validatedData.token}`
    const allowed = rateLimit(rateLimitKey, 5, 15 * 60 * 1000)
    if (!allowed) {
      await recordDownloadAudit({
        token: validatedData.token,
        status: DownloadStatus.RATE_LIMIT,
        ipAddress,
        userAgent,
        format: validatedData.format,
        reason: 'Download rate limit exceeded',
      })
      return NextResponse.json(
        { error: 'Too many download attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const tokenValidation = await validateDownloadToken(validatedData.token)
    if (!tokenValidation.valid) {
      await recordDownloadAudit({
        token: validatedData.token,
        status: DownloadStatus.INVALID_TOKEN,
        ipAddress,
        userAgent,
        format: validatedData.format,
        reason: tokenValidation.error,
      })
      return NextResponse.json({ error: tokenValidation.error }, { status: tokenValidation.status })
    }

    const { customer } = tokenValidation

    if (customer.accessExpiresAt && customer.accessExpiresAt < new Date()) {
      await recordDownloadAudit({
        token: validatedData.token,
        status: DownloadStatus.EXPIRED,
        ipAddress,
        userAgent,
        format: validatedData.format,
        customer,
        reason: 'Download access window expired',
      })
      return NextResponse.json({ error: 'Download access has expired' }, { status: 403 })
    }

    if (customer.sale.status !== 'COMPLETED') {
      await recordDownloadAudit({
        token: validatedData.token,
        status: DownloadStatus.BLOCKED,
        ipAddress,
        userAgent,
        format: validatedData.format,
        customer,
        reason: `Sale status ${customer.sale.status}`,
      })
      return NextResponse.json({ error: 'Sale not completed' }, { status: 403 })
    }

    const downloadResult = await generateTemplateDownload({
      packageType: customer.package,
      format: validatedData.format,
      customer,
    })

    await recordDownloadAudit({
      token: validatedData.token,
      status: DownloadStatus.SUCCESS,
      ipAddress,
      userAgent,
      format: validatedData.format,
      customer,
    })

    const body = new Uint8Array(downloadResult.fileBuffer)

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': downloadResult.contentType,
        'Content-Disposition': `attachment; filename="${downloadResult.filename}"`,
        'Content-Length': downloadResult.fileBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: error.issues },
        { status: 400 }
      )
    }

    logError(error as Error, ErrorType.SYSTEM)
    if (parsedRequest) {
      await recordDownloadAudit({
        token: parsedRequest.token,
        status: DownloadStatus.ERROR,
        ipAddress,
        userAgent,
        format: parsedRequest.format,
        reason: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    return NextResponse.json({ error: 'Failed to process download request' }, { status: 500 })
  }
}

async function validateDownloadToken(token: string): Promise<TokenValidationResult> {
  const customer = await prisma.templateSaleCustomer.findUnique({
    where: { downloadToken: token },
    include: {
      sale: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  })

  if (!customer) {
    return {
      valid: false,
      error: 'Invalid download token',
      status: 404,
    }
  }

  if (!customer.sale || customer.sale.status !== 'COMPLETED') {
    return {
      valid: false,
      error: 'Sale not found or not completed',
      status: 404,
    }
  }

  return { valid: true, customer }
}

async function generateTemplateDownload(params: {
  packageType: string
  format: string
  customer: ValidatedCustomer
}): Promise<DownloadResult> {
  const { packageType, format } = params

  const templateFiles = getTemplateFiles(packageType)

  if (process.env.NODE_ENV === 'production' && !process.env.TEMPLATE_FILES_PATH) {
    throw new Error(
      'Template downloads not configured. Set TEMPLATE_FILES_PATH environment variable.'
    )
  }

  if (process.env.NODE_ENV !== 'production') {
    const mockContent = createMockTemplateZip(packageType, templateFiles)

    return {
      fileBuffer: Buffer.from(mockContent),
      contentType: format === 'zip' ? 'application/zip' : 'application/x-tar',
      filename: `saas-starter-${packageType}-${Date.now()}.${format}`,
    }
  }

  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const archiver = await import('archiver')
    const { PassThrough } = await import('stream')

    const templateBasePath = process.env.TEMPLATE_FILES_PATH || './template-files'
    const archive = archiver.default(format as 'zip' | 'tar')
    const passThrough = new PassThrough()
    const chunks: Buffer[] = []

    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.pipe(passThrough)

    for (const file of templateFiles) {
      if (
        file.tier === 'all' ||
        file.tier === packageType ||
        (file.tier === 'pro+' && ['pro', 'enterprise'].includes(packageType))
      ) {
        const filePath = path.join(templateBasePath, file.path)

        try {
          await fs.access(filePath)
          archive.file(filePath, { name: file.name })
        } catch {
          console.warn(`Template file not found: ${filePath}`)
        }
      }
    }

    // Set up completion promise before finalization
    const completion = new Promise<void>((resolve, reject) => {
      archive.on('error', reject)
      passThrough.on('end', resolve)
      passThrough.on('error', reject)
    })

    // Finalize the archive (this triggers the data flow)
    archive.finalize()

    // Wait for all data to be collected
    await completion

    const buffer = Buffer.concat(chunks)

    return {
      fileBuffer: buffer,
      contentType: format === 'zip' ? 'application/zip' : 'application/x-tar',
      filename: `saas-starter-${packageType}-v${getTemplateVersion()}.${format}`,
    }
  } catch (error) {
    console.error('Template file generation failed:', error)
    throw new Error(
      `Template download temporarily unavailable: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}

function getTemplateFiles(
  packageType: string
): Array<{ path: string; name: string; tier: string }> {
  const allFiles = [
    { path: 'src/', name: 'src/', tier: 'all' },
    { path: 'package.json', name: 'package.json', tier: 'all' },
    { path: 'README.md', name: 'README.md', tier: 'all' },
    { path: 'docs/', name: 'docs/', tier: 'all' },
    { path: '.env.example', name: '.env.example', tier: 'all' },
    { path: 'src/lib/white-label/', name: 'src/lib/white-label/', tier: 'pro+' },
    { path: 'scripts/deploy/', name: 'scripts/deploy/', tier: 'pro+' },
    { path: 'docs/video-tutorials/', name: 'docs/video-tutorials/', tier: 'pro+' },
    { path: 'enterprise/', name: 'enterprise/', tier: 'enterprise' },
    { path: 'scripts/enterprise-setup/', name: 'scripts/enterprise-setup/', tier: 'enterprise' },
    { path: 'docs/custom-integrations/', name: 'docs/custom-integrations/', tier: 'enterprise' },
  ]

  return allFiles.filter((file) => {
    if (file.tier === 'all') return true
    if (file.tier === packageType) return true
    if (file.tier === 'pro+' && ['pro', 'enterprise'].includes(packageType)) return true
    return false
  })
}

function createMockTemplateZip(
  packageType: string,
  templateFiles: Array<{ name: string }>
): string {
  const fileList = templateFiles.map((f) => f.name).join('\n')

  return `
SaaS Starter Template - ${packageType.toUpperCase()} Package
Downloaded: ${new Date().toISOString()}
License Key: [Your license key from email]

Included Files:
${fileList}

This is a development mock. In production, this would be a real ZIP file
containing all the template files for the ${packageType} tier.

Next Steps:
1. Extract this ZIP file to your development directory
2. Follow the README.md for setup instructions
3. Run 'npm install' to install dependencies
4. Copy .env.example to .env.local and configure
5. Run 'npm run dev' to start development

Support:
- Documentation: ${process.env.NEXT_PUBLIC_APP_URL}/docs
- Email: support@your-domain.com
- Package: ${packageType}
  `
}

async function recordDownloadAudit(params: {
  token: string
  status: DownloadStatus
  ipAddress: string
  userAgent: string
  format: string
  reason?: string
  customer?: ValidatedCustomer
}): Promise<void> {
  try {
    await prisma.templateDownloadAudit.create({
      data: {
        downloadToken: params.token,
        status: params.status,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent || null,
        format: params.format,
        reason: params.reason || null,
        saleId: params.customer?.saleId ?? null,
        customerId: params.customer?.id ?? null,
        package: params.customer?.package ?? null,
      },
    })
  } catch (error) {
    console.warn('Template download audit logging failed:', error)
  }
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function getTemplateVersion(): string {
  return process.env.TEMPLATE_VERSION || '1.0.0'
}
