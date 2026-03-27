#!/bin/bash
# Smart Test Strategy - saas-starter-kit
# Generated pattern from create-qa-architect
# https://buildproven.ai/cqa
set -e

echo "🧠 Analyzing changes for optimal test strategy..."

# Environment variable overrides
if [[ "$SKIP_SMART" == "1" ]]; then
  echo "⚠️  SKIP_SMART=1 - Running comprehensive tests"
  npm run test 2>/dev/null || echo "No tests configured"
  exit 0
fi

if [[ "$FORCE_COMPREHENSIVE" == "1" ]]; then
  echo "🔴 FORCE_COMPREHENSIVE=1 - Running all tests"
  npm run test 2>/dev/null || echo "No tests configured"
  exit 0
fi

if [[ "$FORCE_MINIMAL" == "1" ]]; then
  echo "⚪ FORCE_MINIMAL=1 - Running lint only"
  npm run lint && npm run format:check
  exit 0
fi

# Collect metrics
CHANGED_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | wc -l | tr -d ' ')
CHANGED_LINES=$(git diff --stat HEAD~1..HEAD 2>/dev/null | tail -1 | grep -o '[0-9]* insertions' | grep -o '[0-9]*' || echo "0")
CURRENT_BRANCH=$(git branch --show-current)
HOUR=$(date +%H)
DAY_OF_WEEK=$(date +%u)

# Project-specific high-risk patterns (SaaS template with auth/payment)
HIGH_RISK_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | grep -E "(auth|payment|billing|subscription|stripe|prisma/schema|api/)" || true)
API_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | grep -E "api/" || true)
CONFIG_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | grep -E "(package\.json|\.env|config)" || true)
TEST_FILES=$(git diff --name-only HEAD~1..HEAD 2>/dev/null | grep -E "test|spec" || true)

# Calculate risk score (0-10)
RISK_SCORE=0

# File-based risk
[[ -n "$HIGH_RISK_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 4))
[[ -n "$API_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 2))
[[ -n "$CONFIG_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 2))

# Size-based risk
[[ $CHANGED_FILES -gt 10 ]] && RISK_SCORE=$((RISK_SCORE + 2))
[[ $CHANGED_FILES -gt 20 ]] && RISK_SCORE=$((RISK_SCORE + 3))
[[ $CHANGED_LINES -gt 200 ]] && RISK_SCORE=$((RISK_SCORE + 2))

# Branch-based risk
case $CURRENT_BRANCH in
  main|master|production) RISK_SCORE=$((RISK_SCORE + 3)) ;;
  hotfix/*) RISK_SCORE=$((RISK_SCORE + 4)) ;;
  release/*) RISK_SCORE=$((RISK_SCORE + 2)) ;;
  develop) RISK_SCORE=$((RISK_SCORE + 1)) ;;
esac

# Time pressure adjustment (strip leading zeros)
HOUR_NUM=$((10#$HOUR))
if [[ $HOUR_NUM -ge 9 && $HOUR_NUM -le 17 && $DAY_OF_WEEK -le 5 ]]; then
  SPEED_BONUS=true
else
  SPEED_BONUS=false
fi

# Display analysis
echo "📊 Analysis Results:"
echo "   📁 Files: $CHANGED_FILES"
echo "   📏 Lines: $CHANGED_LINES"
echo "   🌿 Branch: $CURRENT_BRANCH"
echo "   🎯 Risk Score: $RISK_SCORE/10"
echo "   ⚡ Speed Bonus: $SPEED_BONUS"
echo ""

# Decision logic
# NOTE: E2E tests are excluded from pre-push (run in CI only)
# - E2E: Requires browser, CI has better infrastructure
# These run in GitHub Actions on every PR and push to main

if [[ $RISK_SCORE -ge 7 ]]; then
  echo "🔴 HIGH RISK - Comprehensive validation (pre-push)"
  echo "   • All tests + typecheck + security audit"
  echo "   • (E2E tests run in CI only)"
  npm run typecheck && npm test && npm run security:all
elif [[ $RISK_SCORE -ge 4 ]]; then
  echo "🟡 MEDIUM RISK - Standard validation"
  echo "   • Lint + format + tests"
  npm run lint && npm run format:check && npm test
elif [[ $RISK_SCORE -ge 2 || "$SPEED_BONUS" == "false" ]]; then
  echo "🟢 LOW RISK - Fast validation"
  echo "   • Lint + format + typecheck"
  npm run lint && npm run format:check && npm run typecheck
else
  echo "⚪ MINIMAL RISK - Quality checks only"
  echo "   • Lint + format check"
  npm run lint && npm run format:check
fi

echo ""
echo "💡 Tip: Run 'npm test && npm run typecheck && npm run security:all' locally for full validation"
