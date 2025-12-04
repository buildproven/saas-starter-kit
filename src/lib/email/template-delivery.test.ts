/**
 * Tests for Template Delivery Email Service
 */

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

import { sendTemplateDeliveryEmail } from './template-delivery'

describe('sendTemplateDeliveryEmail', () => {
  const baseParams = {
    customerEmail: 'test@example.com',
    package: 'hobby' as const,
    accessCredentials: {
      licenseKey: 'HOB-1234-5678-ABCD',
      downloadToken: 'token123',
      downloadUrl: 'https://example.com/download/token123',
      expiresAt: new Date('2024-12-31'),
    },
    customerName: 'Test User',
    companyName: 'Test Company',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
  })

  describe('with Resend API configured', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test_resend_key'
    })

    afterEach(() => {
      delete process.env.RESEND_API_KEY
    })

    it('sends email successfully via Resend', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      })

      const result = await sendTemplateDeliveryEmail(baseParams)

      expect(result.success).toBe(true)
      expect(result.messageId).toBe('msg_123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test_resend_key',
          }),
        })
      )
    })

    it('handles Resend API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Rate limit exceeded',
      })

      const result = await sendTemplateDeliveryEmail(baseParams)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Resend request failed')
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await sendTemplateDeliveryEmail(baseParams)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })

  describe('with no email service configured', () => {
    beforeEach(() => {
      delete process.env.RESEND_API_KEY
    })

    it('logs in development mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

      const result = await sendTemplateDeliveryEmail(baseParams)

      expect(result.success).toBe(true)
      expect(result.messageId).toMatch(/^dev-/)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
      process.env.NODE_ENV = originalNodeEnv
    })

    it('returns noop in production without config', async () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation()

      const result = await sendTemplateDeliveryEmail(baseParams)

      expect(result.success).toBe(true)
      expect(result.messageId).toMatch(/^noop-/)

      consoleWarnSpy.mockRestore()
      process.env.NODE_ENV = originalNodeEnv
    })
  })

  describe('email content generation', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test_key'
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'msg_test' }),
      })
    })

    afterEach(() => {
      delete process.env.RESEND_API_KEY
    })

    it('generates hobby package content', async () => {
      await sendTemplateDeliveryEmail({ ...baseParams, package: 'hobby' })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.subject).toContain('Hobby Package')
      expect(callBody.html).toContain('Community support')
    })

    it('generates pro package content', async () => {
      await sendTemplateDeliveryEmail({ ...baseParams, package: 'pro' })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.subject).toContain('Pro Package')
      expect(callBody.html).toContain('GitHub repository access')
      expect(callBody.html).toContain('Video tutorials')
    })

    it('generates director package content', async () => {
      await sendTemplateDeliveryEmail({ ...baseParams, package: 'director' })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.subject).toContain('Director Package')
      expect(callBody.html).toContain('consultation call')
      expect(callBody.html).toContain('Vibe Lab Pro')
    })

    it('includes customer name in greeting', async () => {
      await sendTemplateDeliveryEmail(baseParams)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.html).toContain('Hi Test User')
    })

    it('handles missing customer name', async () => {
      await sendTemplateDeliveryEmail({
        ...baseParams,
        customerName: null,
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.html).toContain('Hi there')
    })

    it('includes license key and download URL', async () => {
      await sendTemplateDeliveryEmail(baseParams)

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.html).toContain('HOB-1234-5678-ABCD')
      expect(callBody.html).toContain('https://example.com/download/token123')
    })

    it('handles null expiration date', async () => {
      await sendTemplateDeliveryEmail({
        ...baseParams,
        accessCredentials: {
          ...baseParams.accessCredentials,
          expiresAt: null,
        },
      })

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(callBody.html).toContain('Does not expire')
    })
  })
})
