# SaaS Starter Kit - Quality Enforcement

**This project enforces organization-level quality standards. See `/Users/brettstark/Projects/QUALITY_STANDARDS.md` for full details.**

## 🚨 Current Quality Gates

### **Pre-Commit Hooks** (via Husky + lint-staged)

- ✅ ESLint: Zero errors allowed
- ✅ Prettier: Auto-formatting
- ✅ TypeScript: Type checking
- ✅ Stylelint: CSS/SCSS validation

### **GitHub Actions CI/CD**

- ✅ Build verification
- ✅ Test suite execution
- ✅ Security scanning
- ✅ Dependency audit

## 🔧 Quality Commands

```bash
# Check all quality issues
npm run lint                 # ESLint check
npm run lint:fix            # Auto-fix ESLint issues
npm test                    # Run test suite
npm run build               # Verify build
npm run prepare             # Setup pre-commit hooks

# Quality automation (organization-level)
npx create-quality-automation@latest  # Apply/update standards
```

## 📋 Current Quality Status

### **ESLint Configuration**

- **Base**: Organization standards via `create-quality-automation`
- **Project-specific**: `.eslintrc.json` (legacy, prefer eslint.config.cjs)
- **Rules**: Strict TypeScript, security, and code quality checks

### **Pre-commit Hook Enforcement**

```bash
# Located: .husky/pre-commit
# Runs: lint-staged on all staged files
# Blocks: Commits with ESLint errors, formatting issues
```

### **GitHub Actions Quality Pipeline**

```bash
# Located: .github/workflows/quality.yml
# Triggers: Every push, PR
# Checks: Lint, typecheck, tests, template packaging verification, security audit
```

## 🚫 Quality Anti-Patterns (PROHIBITED)

### **NEVER bypass quality gates:**

```bash
# ❌ WRONG: Bypassing pre-commit hooks
git commit --no-verify -m "Quick fix"

# ❌ WRONG: Bypassing GitHub Actions
git push --force-with-lease
```

### **NEVER use eslint-disable shortcuts:**

```typescript
// ❌ WRONG: Disabling rules for convenience
/* eslint-disable @typescript-eslint/no-explicit-any */
const data: any = response

// ✅ CORRECT: Proper typing
interface ApiResponse {
  id: string
  status: 'success' | 'error'
  data: UserData
}
const data: ApiResponse = response
```

## 🎯 Project-Specific Quality Requirements

### **TypeScript Standards**

- **Strict mode**: Enabled in `tsconfig.json`
- **No `any` types**: Use proper interfaces
- **Explicit return types**: For public functions
- **Null checking**: Handle all null/undefined cases

### **API Endpoint Quality**

- **Input validation**: Use Zod schemas
- **Error handling**: Comprehensive try/catch blocks
- **Type safety**: Proper TypeScript throughout
- **Security**: No hardcoded secrets, proper authentication

### **React Component Quality**

- **Prop interfaces**: Explicit TypeScript interfaces
- **Error boundaries**: Handle component failures
- **Accessibility**: WCAG compliance
- **Performance**: Proper memoization where needed

## 📊 Quality Metrics

### **Current Status** (Last Check: $(date))

- ESLint Errors: **MUST BE ZERO**
- TypeScript Errors: **MUST BE ZERO**
- Test Coverage: Target >80%
- Build Status: **MUST PASS**
- Security Vulnerabilities: **ZERO HIGH/CRITICAL**

### **Quality Debt Tracking**

- TODO comments: Tracked and prioritized
- Technical debt: Documented in GitHub issues
- Code complexity: Monitored via ESLint rules

## 🔄 Maintenance

### **Weekly**

- Run full quality audit: `npm run lint && npm test && npm run build`
- Update dependencies: `npm audit fix`
- Review quality metrics

### **Monthly**

- Update quality automation: `npx create-quality-automation@latest --update`
- Review and update project-specific rules
- Clean up technical debt

---

**Quality Champion**: All team members
**Last Updated**: $(date)
**Next Review**: $(date -d '+1 month')

**Remember**: Quality gates are not obstacles - they're safety nets that ensure reliable, maintainable code.
