/**
 * Enhanced SSRF Protection
 *
 * Comprehensive Server-Side Request Forgery protection with:
 * - DNS resolution to IP validation
 * - Private IP range blocking
 * - Port filtering (only 80/443 allowed)
 * - Rate limiting per user and per IP
 * - Domain blocklist support
 * - AWS/GCP/Azure metadata endpoint blocking
 *
 * Ported from postrail for cross-project security standards.
 */

interface SSRFValidationResult {
  allowed: boolean
  error?: string
  ip?: string
  port?: number
}

interface RateLimitRecord {
  count: number
  resetTime: number
  locked: boolean
}

class SSRFProtection {
  private userLimits = new Map<string, RateLimitRecord>()
  private ipLimits = new Map<string, RateLimitRecord>()
  private cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null

  private readonly SCRAPE_REQUESTS_PER_USER_PER_MINUTE = 5
  private readonly SCRAPE_REQUESTS_PER_IP_PER_MINUTE = 10
  private readonly CLEANUP_INTERVAL = 60 * 1000
  private readonly LOCK_TIMEOUT = 1000

  private readonly ALLOWED_PORTS = [80, 443]

  private readonly DOMAIN_BLOCKLIST = [
    // AWS metadata endpoints
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.goog',
    'metadata.google.com',
    // GCP metadata
    'metadata.google.internal',
    // Azure metadata
    '169.254.169.254',
    // Kubernetes metadata
    '10.96.0.1',
    'kubernetes.default.svc.cluster.local',
    // Docker metadata
    'host.docker.internal',
    // Common internal domains
    'localhost',
    'localhost.localdomain',
    'broadcasthost',
    // Custom blocked domains from env var
    ...(process.env.SSRF_BLOCKED_DOMAINS?.split(',').map((d) => d.trim()) || []),
  ]

  constructor() {
    this.cleanupIntervalHandle = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL)
  }

  destroy() {
    if (this.cleanupIntervalHandle) {
      clearInterval(this.cleanupIntervalHandle)
      this.cleanupIntervalHandle = null
    }
  }

  private isPrivateIP(ip: string): boolean {
    if (ip === '127.0.0.1' || ip === 'localhost') return true
    if (ip.startsWith('10.')) return true
    if (ip.startsWith('192.168.')) return true
    if (ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true
    if (ip.startsWith('169.254.')) return true
    if (ip === '0.0.0.0') return true
    if (ip.startsWith('100.64.')) return true
    if (ip.startsWith('203.0.113.')) return true
    if (ip.startsWith('233.252.0.')) return true
    if (ip === '::1') return true
    if (ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true
    if (ip.startsWith('fe80:')) return true
    if (ip.startsWith('::ffff:')) return true
    if (ip.startsWith('2001:db8:')) return true

    return false
  }

  private isAllowedPort(port: number): boolean {
    return this.ALLOWED_PORTS.includes(port)
  }

  private isDomainBlocked(hostname: string): boolean {
    const lowercaseHostname = hostname.toLowerCase()

    return this.DOMAIN_BLOCKLIST.some((blocked) => {
      const lowercaseBlocked = blocked.toLowerCase()
      if (lowercaseHostname === lowercaseBlocked) return true
      if (lowercaseHostname.endsWith('.' + lowercaseBlocked)) return true
      return false
    })
  }

  async checkRateLimit(
    userId: string,
    clientIP: string
  ): Promise<{
    allowed: boolean
    retryAfter?: number
    reason?: string
  }> {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
    const enforceInTests = process.env.ENFORCE_SSRF_RATE_LIMIT_TESTS === 'true'

    if (isTestEnv && !enforceInTests) {
      return { allowed: true }
    }

    const now = Date.now()

    const userKey = `scrape_user:${userId}`
    const userRecord = await this.checkAndUpdateRateLimit(
      userKey,
      this.userLimits,
      this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE,
      now
    )

    if (!userRecord.allowed) {
      return {
        allowed: false,
        retryAfter: Math.ceil(userRecord.retryAfter! / 1000),
        reason: `User rate limit exceeded: ${this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE} requests per minute`,
      }
    }

    const ipKey = `scrape_ip:${clientIP}`
    const ipRecord = await this.checkAndUpdateRateLimit(
      ipKey,
      this.ipLimits,
      this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE,
      now
    )

    if (!ipRecord.allowed) {
      return {
        allowed: false,
        retryAfter: Math.ceil(ipRecord.retryAfter! / 1000),
        reason: `IP rate limit exceeded: ${this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE} requests per minute`,
      }
    }

    return { allowed: true }
  }

  private async acquireLock(key: string, limitMap: Map<string, RateLimitRecord>): Promise<boolean> {
    const startTime = Date.now()
    let acquiring = true

    while (acquiring) {
      const record = limitMap.get(key)

      if (!record) {
        acquiring = false
        return true
      }

      if (!record.locked) {
        record.locked = true
        limitMap.set(key, record)
        acquiring = false
        return true
      }

      if (Date.now() - startTime > this.LOCK_TIMEOUT) {
        record.locked = false
        limitMap.set(key, record)
        acquiring = false
        return true
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    return true
  }

  private releaseLock(key: string, limitMap: Map<string, RateLimitRecord>): void {
    const record = limitMap.get(key)
    if (record) {
      record.locked = false
      limitMap.set(key, record)
    }
  }

  private async checkAndUpdateRateLimit(
    key: string,
    limitMap: Map<string, RateLimitRecord>,
    limit: number,
    now: number
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    await this.acquireLock(key, limitMap)

    try {
      const record = limitMap.get(key)

      if (!record) {
        limitMap.set(key, {
          count: 1,
          resetTime: now + 60 * 1000,
          locked: false,
        })
        return { allowed: true }
      }

      if (now >= record.resetTime) {
        record.count = 1
        record.resetTime = now + 60 * 1000
        limitMap.set(key, record)
        return { allowed: true }
      }

      if (record.count >= limit) {
        return {
          allowed: false,
          retryAfter: record.resetTime - now,
        }
      }

      record.count++
      limitMap.set(key, record)
      return { allowed: true }
    } finally {
      this.releaseLock(key, limitMap)
    }
  }

  async validateUrl(url: string): Promise<SSRFValidationResult> {
    try {
      const parsedUrl = new URL(url)

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          allowed: false,
          error: 'Only HTTP/HTTPS URLs are allowed',
        }
      }

      const hostname = parsedUrl.hostname.toLowerCase()

      if (this.isDomainBlocked(hostname)) {
        return {
          allowed: false,
          error: 'Domain is blocked',
        }
      }

      const port = parsedUrl.port
        ? parseInt(parsedUrl.port)
        : parsedUrl.protocol === 'https:'
          ? 443
          : 80

      if (!this.isAllowedPort(port)) {
        return {
          allowed: false,
          error: `Port ${port} is not allowed. Only ports 80 and 443 are permitted.`,
          port,
        }
      }

      const dns = await import('dns').then((m) => m.promises)
      let resolvedIPs: string[] = []

      try {
        const ipv4Addresses = await dns.resolve4(hostname)
        resolvedIPs = ipv4Addresses
      } catch {
        try {
          const ipv6Addresses = await dns.resolve6(hostname)
          resolvedIPs = ipv6Addresses
        } catch {
          return {
            allowed: false,
            error: 'DNS resolution failed',
          }
        }
      }

      for (const ip of resolvedIPs) {
        if (this.isPrivateIP(ip)) {
          return {
            allowed: false,
            error: `Domain resolves to private/internal IP address: ${ip}`,
            ip,
          }
        }
      }

      if (hostname.includes('..') || hostname.includes('%')) {
        return {
          allowed: false,
          error: 'Suspicious hostname pattern detected',
        }
      }

      return {
        allowed: true,
        ip: resolvedIPs[0],
        port,
      }
    } catch {
      return {
        allowed: false,
        error: 'Invalid URL format',
      }
    }
  }

  getClientIP(request: Request): string {
    const trustProxy = process.env.NEXT_TRUST_PROXY === 'true'

    if (trustProxy) {
      const cfConnectingIp = request.headers.get('cf-connecting-ip')
      if (cfConnectingIp && this.isValidPublicIP(cfConnectingIp.trim())) {
        return cfConnectingIp.trim()
      }

      const xRealIp = request.headers.get('x-real-ip')
      if (xRealIp && this.isValidPublicIP(xRealIp.trim())) {
        return xRealIp.trim()
      }

      const xForwardedFor = request.headers.get('x-forwarded-for')
      if (xForwardedFor) {
        const ips = xForwardedFor.split(',').map((ip) => ip.trim())
        for (const ip of ips) {
          if (this.isValidPublicIP(ip)) {
            return ip
          }
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      return '127.0.0.1'
    }

    return 'unknown'
  }

  private isValidIP(ip: string): boolean {
    if (!ip || ip.length === 0) return false

    // Simple IPv4 validation without vulnerable nested quantifiers
    const ipv4Parts = ip.split('.')
    if (ipv4Parts.length === 4) {
      const isValidIPv4 = ipv4Parts.every((part) => {
        const num = parseInt(part, 10)
        return !isNaN(num) && num >= 0 && num <= 255 && part === String(num)
      })
      if (isValidIPv4) return true
    }

    // Simple IPv6 validation for common formats
    if (ip === '::1' || ip === '::') return true
    const ipv6Parts = ip.split(':')
    if (ipv6Parts.length === 8) {
      const isValidIPv6 = ipv6Parts.every(
        (part) => part.length >= 1 && part.length <= 4 && /^[0-9a-fA-F]+$/.test(part)
      )
      if (isValidIPv6) return true
    }

    return false
  }

  private isValidPublicIP(ip: string): boolean {
    if (!this.isValidIP(ip)) return false
    if (this.isPrivateIP(ip)) return false
    return true
  }

  private cleanup(): void {
    const now = Date.now()

    for (const [key, record] of this.userLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) {
        this.userLimits.delete(key)
      }
    }

    for (const [key, record] of this.ipLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) {
        this.ipLimits.delete(key)
      }
    }
  }

  getStats() {
    return {
      activeUserLimits: this.userLimits.size,
      activeIPLimits: this.ipLimits.size,
      allowedPorts: this.ALLOWED_PORTS,
      blockedDomains: this.DOMAIN_BLOCKLIST.length,
      rateLimits: {
        userRequestsPerMinute: this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE,
        ipRequestsPerMinute: this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE,
      },
      timestamp: Date.now(),
    }
  }
}

export const ssrfProtection = new SSRFProtection()
export type { SSRFValidationResult }
