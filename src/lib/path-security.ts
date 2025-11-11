/**
 * Path Security Utilities
 *
 * Prevents path traversal attacks by validating file paths.
 */

import path from 'path'

/**
 * Sanitize and validate a file path to prevent path traversal attacks.
 *
 * @param basePath - The base directory that all paths must be within
 * @param userPath - The user-provided path (potentially malicious)
 * @returns The sanitized absolute path
 * @throws Error if the path attempts to traverse outside the base directory
 *
 * @example
 * ```typescript
 * const basePath = '/var/app/templates'
 * const userPath = '../../../etc/passwd' // Malicious
 * sanitizeFilePath(basePath, userPath) // Throws error
 *
 * const safePath = 'basic/README.md' // Safe
 * sanitizeFilePath(basePath, safePath) // Returns '/var/app/templates/basic/README.md'
 * ```
 */
export function sanitizeFilePath(basePath: string, userPath: string): string {
  // Resolve both paths to absolute paths
  const resolvedBase = path.resolve(basePath)
  const resolvedPath = path.resolve(basePath, userPath)

  // Normalize paths to handle different OS path separators
  const normalizedBase = path.normalize(resolvedBase)
  const normalizedPath = path.normalize(resolvedPath)

  // Check if resolved path starts with base path
  // This prevents path traversal (e.g., ../../../etc/passwd)
  if (!normalizedPath.startsWith(normalizedBase + path.sep) && normalizedPath !== normalizedBase) {
    throw new Error(
      `Invalid file path: Path traversal detected. Path "${userPath}" is outside allowed directory.`
    )
  }

  return normalizedPath
}

/**
 * Validate that a path doesn't contain suspicious patterns.
 *
 * @param filePath - The path to validate
 * @returns true if path is safe, false otherwise
 */
export function isSafePathPattern(filePath: string): boolean {
  // Check for null bytes (can be used to bypass extension checks)
  if (filePath.includes('\0')) {
    return false
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /\.\./, // Parent directory traversal
    /^\/etc\//, // Direct access to system files
    /^\/proc\//, // Direct access to proc filesystem
    /^\/sys\//, // Direct access to sys filesystem
    /^~\//, // Home directory access
    /\$\{/, // Template injection
    /\$\(/, // Command substitution
  ]

  return !suspiciousPatterns.some((pattern) => pattern.test(filePath))
}

/**
 * Get the relative path from base to target, ensuring it's within the base directory.
 *
 * @param basePath - The base directory
 * @param targetPath - The target path
 * @returns The relative path from base to target
 * @throws Error if target is outside base directory
 */
export function getSafeRelativePath(basePath: string, targetPath: string): string {
  const sanitized = sanitizeFilePath(basePath, targetPath)
  const relative = path.relative(basePath, sanitized)

  // Double-check that relative path doesn't start with ..
  if (relative.startsWith('..')) {
    throw new Error(`Invalid relative path: ${relative}`)
  }

  return relative
}
