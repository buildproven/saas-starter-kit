/**
 * Template Download API
 *
 * Secure download endpoint that validates tokens and provides
 * time-limited access to template files based on purchase tier.
 */

interface TemplateSaleCustomer {
  id: string
  package: string
  accessExpiresAt: Date | null
  saleId: string
}

interface DownloadResult {
  fileBuffer: Buffer
  contentType: string
  filename: string
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logError, ErrorType } from '@/lib/error-logging'

const DownloadRequestSchema = z.object({
  token: z.string(),
  format: z.enum(['zip', 'tar']).optional().default('zip'),
})

// GET /template-download?token=...&format=zip
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    const format = url.searchParams.get('format') || 'zip'

    const validatedData = DownloadRequestSchema.parse({ token, format })

    // Validate the download token
    const tokenValidation = await validateDownloadToken(validatedData.token)

    if (!tokenValidation.valid) {
      return NextResponse.json(
        { error: tokenValidation.error },
        { status: tokenValidation.status }
      )
    }

    // Get the customer and sale information
    const customer = await prisma.templateSaleCustomer.findUnique({
      where: { downloadToken: validatedData.token },
      include: { sale: true },
    })

    if (!customer) {
      return NextResponse.json(
        { error: 'Invalid download token' },
        { status: 404 }
      )
    }

    // Check access expiration
    if (customer.accessExpiresAt && customer.accessExpiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Download access has expired' },
        { status: 403 }
      )
    }

    // Generate the appropriate download based on package tier
    const downloadResult = await generateTemplateDownload({
      packageType: customer.package,
      format: validatedData.format,
      customer,
    })

    // Log the download for analytics and security
    await logDownload({
      customerId: customer.id,
      saleId: customer.saleId,
      packageType: customer.package,
      format: validatedData.format,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || '',
    })

    // Return the file download
    return new NextResponse(downloadResult.fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': downloadResult.contentType,
        'Content-Disposition': `attachment; filename="${downloadResult.filename}"`,
        'Content-Length': downloadResult.fileBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
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
    return NextResponse.json(
      { error: 'Failed to process download request' },
      { status: 500 }
    )
  }
}

async function validateDownloadToken(token: string) {
  try {
    // Decode the token (in production, use proper JWT verification)
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString())

    // Check expiration
    if (payload.exp && payload.exp < Date.now()) {
      return {
        valid: false,
        error: 'Download token has expired',
        status: 403,
      }
    }

    // Check token type
    if (payload.type !== 'template_download') {
      return {
        valid: false,
        error: 'Invalid token type',
        status: 400,
      }
    }

    // Verify the sale exists and is completed
    const sale = await prisma.templateSale.findUnique({
      where: { id: payload.saleId },
    })

    if (!sale || sale.status !== 'COMPLETED') {
      return {
        valid: false,
        error: 'Sale not found or not completed',
        status: 404,
      }
    }

    return { valid: true }

  } catch (error) {
    return {
      valid: false,
      error: 'Invalid token format',
      status: 400,
    }
  }
}

async function generateTemplateDownload(params: {
  packageType: string
  format: string
  customer: TemplateSaleCustomer
}): Promise<DownloadResult> {
  const { packageType, format } = params

  // Get the appropriate template files based on package tier
  const templateFiles = getTemplateFiles(packageType)

  // Check if template files are configured for production
  if (process.env.NODE_ENV === 'production' && !process.env.TEMPLATE_FILES_PATH) {
    // Return 501 Not Implemented with helpful message
    throw new Error('Template downloads not configured. Set TEMPLATE_FILES_PATH environment variable.')
  }

  if (process.env.NODE_ENV === 'development') {
    // In development, return a mock zip file
    const mockContent = createMockTemplateZip(packageType, templateFiles)

    return {
      fileBuffer: Buffer.from(mockContent),
      contentType: format === 'zip' ? 'application/zip' : 'application/x-tar',
      filename: `saas-starter-${packageType}-${Date.now()}.${format}`,
    }
  }

  // Production implementation with proper error handling
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const archiver = await import('archiver')

    const templateBasePath = process.env.TEMPLATE_FILES_PATH || './template-files'
    const archive = archiver.default(format as 'zip' | 'tar')
    const chunks: Buffer[] = []

    // Collect archive data
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))

    // Add template files based on tier
    for (const file of templateFiles) {
      if (file.tier === 'all' || file.tier === packageType ||
          (file.tier === 'pro+' && ['pro', 'enterprise'].includes(packageType))) {

        const filePath = path.join(templateBasePath, file.path)

        try {
          await fs.access(filePath)
          archive.file(filePath, { name: file.name })
        } catch {
          console.warn(`Template file not found: ${filePath}`)
          // Continue without this file rather than failing completely
        }
      }
    }

    archive.finalize()

    // Wait for archive to complete
    await new Promise((resolve, reject) => {
      archive.on('end', resolve)
      archive.on('error', reject)
    })

    const buffer = Buffer.concat(chunks)

    return {
      fileBuffer: buffer,
      contentType: format === 'zip' ? 'application/zip' : 'application/x-tar',
      filename: `saas-starter-${packageType}-v${_getTemplateVersion()}.${format}`,
    }

  } catch (error) {
    console.error('Template file generation failed:', error)
    throw new Error(`Template download temporarily unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

function getTemplateFiles(packageType: string): Array<{ path: string; name: string; tier: string }> {
  // Define which files are included in each package tier
  const allFiles = [
    // Core files (all tiers)
    { path: 'src/', name: 'src/', tier: 'all' },
    { path: 'package.json', name: 'package.json', tier: 'all' },
    { path: 'README.md', name: 'README.md', tier: 'all' },
    { path: 'docs/', name: 'docs/', tier: 'all' },
    { path: '.env.example', name: '.env.example', tier: 'all' },

    // Pro+ features
    { path: 'src/lib/white-label/', name: 'src/lib/white-label/', tier: 'pro+' },
    { path: 'scripts/deploy/', name: 'scripts/deploy/', tier: 'pro+' },
    { path: 'docs/video-tutorials/', name: 'docs/video-tutorials/', tier: 'pro+' },

    // Enterprise only
    { path: 'enterprise/', name: 'enterprise/', tier: 'enterprise' },
    { path: 'scripts/enterprise-setup/', name: 'scripts/enterprise-setup/', tier: 'enterprise' },
    { path: 'docs/custom-integrations/', name: 'docs/custom-integrations/', tier: 'enterprise' },
  ]

  return allFiles.filter(file => {
    if (file.tier === 'all') return true
    if (file.tier === packageType) return true
    if (file.tier === 'pro+' && ['pro', 'enterprise'].includes(packageType)) return true
    return false
  })
}

function createMockTemplateZip(packageType: string, templateFiles: Array<{ name: string }>): string {
  // Create a mock ZIP file content for development
  const fileList = templateFiles.map(f => f.name).join('\n')

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

async function logDownload(params: {
  customerId: string
  saleId: string
  packageType: string
  format: string
  ipAddress: string
  userAgent: string
}): Promise<void> {
  // Log download for analytics and security monitoring
  console.log('Template download:', {
    ...params,
    timestamp: new Date().toISOString(),
  })

  // In production, save to analytics/audit database:
  /*
  await prisma.templateDownloadLog.create({
    data: {
      customerId: params.customerId,
      saleId: params.saleId,
      packageType: params.packageType,
      format: params.format,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      downloadedAt: new Date(),
    },
  })
  */
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function _getTemplateVersion(): string {
  // Return current template version (prefixed with _ to indicate intentionally unused)
  return process.env.TEMPLATE_VERSION || '1.0.0'
}

/**
 * Usage Examples:
 *
 * // Download ZIP (default)
 * GET /template-download?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
 *
 * // Download TAR
 * GET /template-download?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...&format=tar
 *
 * // Client-side download trigger:
 * window.location.href = `/template-download?token=${downloadToken}`
 */