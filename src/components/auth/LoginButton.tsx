'use client'

import { useAuth } from '@/hooks/use-auth'
import { signInWithGoogle, signOut } from '@/lib/auth/actions'
import { Button } from '@/components/ui/Button'

interface LoginButtonProps {
  provider?: string
  className?: string
}

export function LoginButton({ provider, className }: LoginButtonProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <Button disabled className={className}>
        Loading...
      </Button>
    )
  }

  if (user) {
    return (
      <Button onClick={() => signOut()} variant="outline" className={className}>
        Sign Out
      </Button>
    )
  }

  const handleSignIn = async () => {
    if (provider === 'google') {
      await signInWithGoogle('/')
    } else {
      window.location.href = '/login'
    }
  }

  return (
    <Button onClick={handleSignIn} className={className}>
      {provider ? `Sign in with ${provider}` : 'Sign In'}
    </Button>
  )
}
