# Quality Gates Reference

**This file serves as a quick reference for quality enforcement in this project.**

## 🚨 Zero Tolerance Policy

**The following actions are PROHIBITED and will block commits:**

### ❌ **NEVER DO THIS:**

```bash
# Bypass pre-commit hooks
git commit --no-verify

# Disable ESLint rules without justification
/* eslint-disable @typescript-eslint/no-explicit-any */

# Use any types for convenience
const data: any = apiResponse
```

### ✅ **ALWAYS DO THIS:**

```bash
# Fix ESLint errors properly
npm run lint:fix
# Then manually fix remaining issues

# Use proper TypeScript types
interface ApiResponse {
  id: string
  status: 'success' | 'error'
}
const data: ApiResponse = apiResponse
```

## 🔧 Quality Commands

```bash
# Before committing
npm run lint              # Check for errors
npm run lint:fix          # Auto-fix what's possible
npm test                  # Run all tests
npm run build             # Verify build works

# Quality automation
npx create-quality-automation@latest  # Apply org standards
```

## 📋 Current Enforcement

- **Pre-commit**: Husky + lint-staged blocks bad commits
- **CI/CD**: GitHub Actions validates all pushes
- **Branch Protection**: Requires passing checks for merges

## 🎯 Quality Principles

1. **Fix root causes** - Don't just silence warnings
2. **Type safety first** - Explicit TypeScript interfaces
3. **Clean code** - No unused variables or dead code
4. **Test coverage** - All critical paths tested
5. **Security** - No hardcoded secrets or vulnerabilities

---

**For full details**: See `/Users/brettstark/Projects/QUALITY_STANDARDS.md`
