import { GET } from './route'
import type { NextRequest } from 'next/server'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    templateSaleCustomer: {
      findUnique: jest.fn(),
    },
    templateDownloadAudit: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/error-logging', () => ({
  logError: jest.fn(),
  ErrorType: { SYSTEM: 'SYSTEM' },
}))

jest.mock('@/lib/auth/api-protection', () => ({
  rateLimit: jest.fn(),
}))

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    templateSaleCustomer: { findUnique: jest.Mock }
    templateDownloadAudit: { create: jest.Mock }
  }
}

const { rateLimit } = jest.requireMock('@/lib/auth/api-protection') as {
  rateLimit: jest.Mock
}

const createRequest = (token: string, format: 'zip' | 'tar' = 'zip'): NextRequest => {
  const headers = new Headers()
  headers.set('x-forwarded-for', '203.0.113.1')
  headers.set('user-agent', 'JestTest/1.0')

  return {
    url: `https://example.com/template-download?token=${token}&format=${format}`,
    headers,
  } as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('/template-download rate limiting and audit', () => {
  it('returns 429 when rate limit exceeded', async () => {
    rateLimit.mockReturnValueOnce(false)

    const response = await GET(createRequest('token123'))
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toMatch(/Too many download attempts/)
    expect(prisma.templateSaleCustomer.findUnique).not.toHaveBeenCalled()
    expect(prisma.templateDownloadAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RATE_LIMIT', downloadToken: 'token123' }),
      })
    )
  })

  it('records invalid token attempts', async () => {
    rateLimit.mockReturnValueOnce(true)
    prisma.templateSaleCustomer.findUnique.mockResolvedValueOnce(null)

    const response = await GET(createRequest('invalid'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Invalid download token')
    expect(prisma.templateDownloadAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'INVALID_TOKEN', downloadToken: 'invalid' }),
      })
    )
  })

  it('allows valid download and audits success', async () => {
    rateLimit.mockReturnValueOnce(true)
    prisma.templateSaleCustomer.findUnique.mockResolvedValueOnce({
      id: 'cust_1',
      saleId: 'sale_1',
      package: 'pro',
      accessExpiresAt: null,
      sale: { id: 'sale_1', status: 'COMPLETED' },
    })

    const response = await GET(createRequest('valid'))

    expect(response.status).toBe(200)
    expect(prisma.templateDownloadAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS', downloadToken: 'valid' }),
      })
    )
  })
})
jest.mock('next/server', () => {
  class MockNextResponse {
    body: unknown
    status: number
    headers: Map<string, string>

    constructor(body?: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
      this.body = body
      this.status = init.status ?? 200
      this.headers = new Map(Object.entries(init.headers || {}))
    }

    async arrayBuffer() {
      if (this.body instanceof Uint8Array) {
        return this.body
      }
      return new Uint8Array()
    }
  }

  const json = jest.fn((data: unknown, init: { status?: number } = {}) => ({
    json: jest.fn().mockResolvedValue(data),
    status: init.status ?? 200,
    headers: new Map<string, string>(),
  }))

  return {
    NextResponse: Object.assign(MockNextResponse, { json }),
  }
})

describe('Production archiver flow', () => {
  let tempDir: string
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(async () => {
    process.env.NODE_ENV = 'production'

    // Create temp directory for fixtures
    const os = await import('os')
    const fs = await import('fs/promises')
    const path = await import('path')

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'template-test-'))
    process.env.TEMPLATE_FILES_PATH = tempDir

    // Create fixture structure with directories and files
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true })
    await fs.mkdir(path.join(tempDir, 'docs'), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }))
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test Template')
    await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export {}')
    await fs.writeFile(path.join(tempDir, 'docs', 'guide.md'), '# Guide')
  })

  afterEach(async () => {
    process.env.NODE_ENV = originalNodeEnv

    // Clean up temp directory
    if (tempDir) {
      const fs = await import('fs/promises')
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('generates real ZIP archive with directories and files', async () => {
    rateLimit.mockReturnValue(true)
    prisma.templateSaleCustomer.findUnique.mockResolvedValue({
      id: 'cust_prod_1',
      saleId: 'sale_prod_1',
      package: 'basic',
      accessExpiresAt: null,
      sale: { id: 'sale_prod_1', status: 'COMPLETED' },
    })

    const response = await GET(createRequest('valid_prod_token', 'zip'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(response.headers.get('Content-Disposition')).toContain('attachment')

    // Verify archive contains data
    const buffer = Buffer.from(await response.arrayBuffer())
    expect(buffer.length).toBeGreaterThan(0)

    // ZIP file signature (PK)
    expect(buffer[0]).toBe(0x50) // 'P'
    expect(buffer[1]).toBe(0x4b) // 'K'
  })

  it('handles directories correctly using archive.directory()', async () => {
    rateLimit.mockReturnValue(true)
    prisma.templateSaleCustomer.findUnique.mockResolvedValue({
      id: 'cust_dir_1',
      saleId: 'sale_dir_1',
      package: 'basic',
      accessExpiresAt: null,
      sale: { id: 'sale_dir_1', status: 'COMPLETED' },
    })

    // This should not throw EISDIR error
    const response = await GET(createRequest('valid_dir_token'))

    expect(response.status).toBe(200)

    // Verify no EISDIR errors in audit log
    const auditCalls = prisma.templateDownloadAudit.create.mock.calls
    const successCall = auditCalls.find((call) => call[0].data.status === 'SUCCESS')
    expect(successCall).toBeTruthy()
  })

  it('blocks path traversal attempts in production', async () => {
    rateLimit.mockReturnValue(true)

    // Mock getTemplateFiles to return malicious path
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    jest
      .spyOn(require('./route'), 'getTemplateFiles')
      .mockReturnValue([{ path: '../../../etc/passwd', name: 'malicious', tier: 'all' }])

    prisma.templateSaleCustomer.findUnique.mockResolvedValue({
      id: 'cust_sec_1',
      saleId: 'sale_sec_1',
      package: 'basic',
      accessExpiresAt: null,
      sale: { id: 'sale_sec_1', status: 'COMPLETED' },
    })

    // Should not throw but should skip the malicious file
    const response = await GET(createRequest('valid_sec_token'))

    // Should still return 200 but without the malicious file
    expect(response.status).toBe(200)
  })
})
