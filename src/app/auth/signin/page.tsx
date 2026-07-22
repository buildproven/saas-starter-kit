'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { signInWithGithub, signInWithGoogle } from '@/lib/auth/actions'

export default function SignInPage() {
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (provider: 'google' | 'github') => {
    setLoadingProvider(provider)
    setError(null)

    try {
      await (provider === 'google' ? signInWithGoogle('/') : signInWithGithub('/'))
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Unable to start sign-in')
      setLoadingProvider(null)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Continue with an OAuth provider configured in Supabase.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <Button
            onClick={() => handleSignIn('google')}
            className="w-full justify-center"
            variant="outline"
            disabled={loadingProvider !== null}
          >
            {loadingProvider === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
          </Button>
          <Button
            onClick={() => handleSignIn('github')}
            className="w-full justify-center"
            variant="outline"
            disabled={loadingProvider !== null}
          >
            {loadingProvider === 'github' ? 'Connecting to GitHub…' : 'Continue with GitHub'}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
