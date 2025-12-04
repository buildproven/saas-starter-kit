import React from 'react'
import { render } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'vitest-axe'

expect.extend(toHaveNoViolations)

import HomePage from './page'

vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

describe('Home page accessibility', () => {
  it('has no obvious accessibility violations', async () => {
    const { container } = render(<HomePage />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
