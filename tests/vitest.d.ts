/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mock, Mocked, MockedFunction, MockInstance } from 'vitest'

declare global {
  // Extend vi namespace for type usage
  namespace vi {
    type Mock<T = any> = import('vitest').Mock<T>
    type Mocked<T> = import('vitest').Mocked<T>
    type MockedFunction<T extends (...args: any[]) => any> = import('vitest').MockedFunction<T>
    type MockInstance<T extends (...args: any[]) => any> = import('vitest').MockInstance<T>
  }

  // Allow reassigning process.env.NODE_ENV in tests
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test'
    }
  }
}

// Re-export vitest types for convenience
export type { Mock, Mocked, MockedFunction, MockInstance }

export {}
