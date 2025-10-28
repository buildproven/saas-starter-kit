'use client'

import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'

export default function SignOutPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  const handleSignOut = async () => {
    setLoading(true)
    try {
      await signOut({ callbackUrl: '/' })
    } catch (error) {
      console.error('Sign out error:', error)
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Sign out of your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Are you sure you want to sign out?
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {session.user && (
            <div className="bg-white p-4 rounded-lg border text-center">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full mx-auto mb-2"
                />
              )}
              <p className="font-medium text-gray-900">
                {session.user.name || session.user.email}
              </p>
              {session.user.name && (
                <p className="text-sm text-gray-600">{session.user.email}</p>
              )}
            </div>
          )}

          <div className="flex space-x-4">
            <Button
              onClick={handleSignOut}
              isLoading={loading}
              className="flex-1"
              variant="primary"
            >
              {loading ? 'Signing out...' : 'Sign Out'}
            </Button>
            <Button
              onClick={() => router.push('/')}
              className="flex-1"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}