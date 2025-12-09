const js = require('@eslint/js')
const globals = require('globals')

let tsPlugin = null
let tsParser = null
let security = null
try {
  tsPlugin = require('@typescript-eslint/eslint-plugin')
  tsParser = require('@typescript-eslint/parser')
} catch {
  // TypeScript tooling not installed yet; fall back to JS-only config.
}

try {
  security = require('eslint-plugin-security')
} catch {
  // Security plugin not installed yet; fall back to basic config
}

const configs = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/examples/**',
      '**/scripts/**',
      'jest.setup.ts',
      'landing-page.html',
    ],
  },
  js.configs.recommended,
]

// Base rules configuration
const baseRules = {
  // XSS Prevention patterns - critical for web applications
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
}

// Security rules only if plugin is loaded
const securityRules = security
  ? {
      // Security rules from WFHroulette patterns - adjusted for build tools
      'security/detect-non-literal-regexp': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn', // Build tools may spawn processes
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn', // Build tools need dynamic file operations
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
    }
  : {}

configs.push({
  files: ['**/*.{js,jsx,mjs,cjs,html}'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      ...globals.browser,
      ...globals.node,
    },
  },
  plugins: {
    ...(security ? { security } : {}),
  },
  rules: {
    ...baseRules,
    ...securityRules,
  },
})

if (tsPlugin && tsParser) {
  configs.push({
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      ...(security ? { security } : {}),
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...securityRules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  })
}

// Vitest test file configuration
configs.push({
  files: [
    '**/*.test.{js,jsx,ts,tsx}',
    '**/*.spec.{js,jsx,ts,tsx}',
    '**/vitest.setup.{js,ts}',
    '**/test-utils.{js,ts,tsx}',
    'tests/**/*.{js,ts,tsx}',
  ],
  languageOptions: {
    globals: {
      ...globals.jest,
      vi: 'readonly',
      describe: 'readonly',
      it: 'readonly',
      expect: 'readonly',
      beforeEach: 'readonly',
      afterEach: 'readonly',
      beforeAll: 'readonly',
      afterAll: 'readonly',
      test: 'readonly',
    },
  },
})

// React configuration for JSX files
configs.push({
  files: ['**/*.{jsx,tsx}'],
  languageOptions: {
    globals: {
      React: 'readonly',
    },
  },
})

// Config files and test utilities can use require()
configs.push({
  files: ['**/*.config.{js,cjs,ts}', '**/tailwind.config.ts', '**/test-utils.{ts,tsx}'],
  rules: {
    '@typescript-eslint/no-require-imports': 'off',
  },
})

module.exports = configs
