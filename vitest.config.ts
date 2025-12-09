import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/*.spec.ts'],
    passWithNoTests: true,
    coverage: {
      reportOnFailure: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/app/api/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
        'src/components/**/*.{ts,tsx}',
      ],
      exclude: [
        'tests/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/node_modules/**',
        '**/*.config.{ts,js}',
        '**/types/**',
        // Framework integration files - tested via E2E
        'src/lib/prisma.ts',
        'src/lib/stripe.ts',
        'src/lib/supabase/middleware.ts',
        'src/lib/supabase/server.ts',
        // Re-export barrels
        'src/lib/auth/index.ts',
        'src/components/auth/index.ts',
        // shadcn/ui primitives - thin wrappers over Radix
        'src/components/ui/avatar.tsx',
        'src/components/ui/input.tsx',
        'src/components/ui/label.tsx',
        'src/components/ui/skeleton.tsx',
        'src/components/ui/switch.tsx',
        'src/components/ui/tabs.tsx',
        'src/components/ui/textarea.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // React 19 compatibility: redirect deprecated react-dom/test-utils to our shim
      'react-dom/test-utils': path.resolve(__dirname, './tests/test-utils-shim.ts'),
    },
  },
})
