#!/usr/bin/env node
/**
 * Coverage threshold checker
 * Works around Jest V8 coverage threshold bug
 */

const fs = require('fs')
const path = require('path')

const THRESHOLDS = {
  lines: 30,
  statements: 30,
  functions: 45,
  branches: 60,
}

const coveragePath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json')

if (!fs.existsSync(coveragePath)) {
  console.error('❌ Coverage summary not found. Run: npm test -- --coverage')
  process.exit(1)
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'))
const total = coverage.total

let failed = false

console.log('\n📊 Coverage Report\n')
console.log('Metric      | Actual | Threshold | Status')
console.log('------------|--------|-----------|-------')

for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
  const actual = total[metric]?.pct ?? 0
  const pass = actual >= threshold
  const status = pass ? '✅' : '❌'

  console.log(`${metric.padEnd(12)}| ${actual.toFixed(1).padStart(5)}% | ${String(threshold).padStart(8)}% | ${status}`)

  if (!pass) failed = true
}

console.log('')

if (failed) {
  console.error('❌ Coverage thresholds not met\n')
  process.exit(1)
} else {
  console.log('✅ All coverage thresholds met\n')
}
