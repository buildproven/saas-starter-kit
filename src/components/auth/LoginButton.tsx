'use client'

import { signIn, signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/Button'

interface LoginButtonProps {
  provider?: string
  className?: string
}

export function LoginButton({ provider, className }: LoginButtonProps) {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <Button disabled className={className}>
        Loading...
      </Button>
    )
  }

  if (session) {
    return (
      <Button onClick={() => signOut()} variant="outline" className={className}>
        Sign Out
      </Button>
    )
  }

  const handleSignIn = () => {
    signIn(provider, { callbackUrl: '/' })
  }

  return (
    <Button onClick={handleSignIn} className={className}>
      {provider ? `Sign in with ${provider}` : 'Sign In'}
    </Button>
  )
}