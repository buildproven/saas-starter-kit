'use client'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'

interface SessionProviderProps {
  children: React.ReactNode
  session: unknown
}

export function SessionProvider({ children, session }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session={session as any}
    >
      {children}
    </NextAuthSessionProvider>
  )
}