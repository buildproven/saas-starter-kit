import { sanitizeFilePath, isSafePathPattern, getSafeRelativePath } from './path-security'
import path from 'path'

describe('path-security', () => {
  describe('sanitizeFilePath', () => {
    const basePath = '/var/app/templates'

    it('allows safe paths within base directory', () => {
      const result = sanitizeFilePath(basePath, 'basic/README.md')
      expect(result).toBe(path.resolve(basePath, 'basic/README.md'))
    })

    it('allows safe nested paths', () => {
      const result = sanitizeFilePath(basePath, 'pro/docs/guide.md')
      expect(result).toBe(path.resolve(basePath, 'pro/docs/guide.md'))
    })

    it('blocks path traversal with ../..', () => {
      expect(() => {
        sanitizeFilePath(basePath, '../../../etc/passwd')
      }).toThrow('Path traversal detected')
    })

    it('blocks absolute paths outside base', () => {
      expect(() => {
        sanitizeFilePath(basePath, '/etc/passwd')
      }).toThrow('Path traversal detected')
    })

    it('blocks path traversal with mixed separators on Windows', () => {
      if (process.platform !== 'win32') {
        // Skip this test on non-Windows platforms
        return
      }
      expect(() => {
        sanitizeFilePath(basePath, '..\\..\\..\\windows\\system32')
      }).toThrow('Path traversal detected')
    })

    it('blocks path traversal with forward slashes on Unix', () => {
      if (process.platform === 'win32') {
        // Skip this test on Windows
        return
      }
      expect(() => {
        sanitizeFilePath(basePath, '../../../etc/passwd')
      }).toThrow('Path traversal detected')
    })

    it('allows base path itself', () => {
      const result = sanitizeFilePath(basePath, '.')
      expect(result).toBe(path.resolve(basePath))
    })

    it('normalizes paths correctly', () => {
      const result = sanitizeFilePath(basePath, 'basic/./docs/../README.md')
      expect(result).toBe(path.resolve(basePath, 'basic/README.md'))
    })

    it('handles trailing slashes', () => {
      const result = sanitizeFilePath(basePath, 'basic/')
      expect(result).toBe(path.resolve(basePath, 'basic'))
    })
  })

  describe('isSafePathPattern', () => {
    it('returns true for safe file paths', () => {
      expect(isSafePathPattern('basic/README.md')).toBe(true)
      expect(isSafePathPattern('docs/guide.pdf')).toBe(true)
      expect(isSafePathPattern('src/index.ts')).toBe(true)
    })

    it('returns false for paths with parent directory traversal', () => {
      expect(isSafePathPattern('../etc/passwd')).toBe(false)
      expect(isSafePathPattern('foo/../../../bar')).toBe(false)
    })

    it('returns false for system paths', () => {
      expect(isSafePathPattern('/etc/passwd')).toBe(false)
      expect(isSafePathPattern('/proc/self/environ')).toBe(false)
      expect(isSafePathPattern('/sys/kernel')).toBe(false)
    })

    it('returns false for home directory paths', () => {
      expect(isSafePathPattern('~/malicious')).toBe(false)
    })

    it('returns false for null bytes', () => {
      expect(isSafePathPattern('file.txt\0.jpg')).toBe(false)
    })

    it('returns false for template injection', () => {
      expect(isSafePathPattern('file-${malicious}.txt')).toBe(false)
    })

    it('returns false for command substitution', () => {
      expect(isSafePathPattern('file-$(whoami).txt')).toBe(false)
    })
  })

  describe('getSafeRelativePath', () => {
    const basePath = '/var/app/templates'

    it('returns relative path for safe file', () => {
      const result = getSafeRelativePath(basePath, 'basic/README.md')
      expect(result).toBe(path.join('basic', 'README.md'))
      expect(result.startsWith('..')).toBe(false)
    })

    it('returns relative path for nested file', () => {
      const result = getSafeRelativePath(basePath, 'pro/docs/guide.md')
      expect(result).toBe(path.join('pro', 'docs', 'guide.md'))
    })

    it('throws for paths outside base directory', () => {
      expect(() => {
        getSafeRelativePath(basePath, '../../../etc/passwd')
      }).toThrow()
    })

    it('returns empty string for base path itself', () => {
      const result = getSafeRelativePath(basePath, '.')
      expect(result).toBe('')
    })
  })
})
