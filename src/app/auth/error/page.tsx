'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

const errorMessages: Record<string, string> = {
  Configuration: 'There is a problem with the server configuration.',
  AccessDenied: 'Access was denied. You do not have permission to sign in.',
  Verification: 'The verification token has expired or has already been used.',
  Default: 'An error occurred during authentication.',
}

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams?.get('error')

  const errorMessage = error && errorMessages[error]
    ? errorMessages[error]
    : errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Authentication Error
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {errorMessage}
          </p>
          {error && (
            <p className="mt-1 text-xs text-gray-500">
              Error code: {error}
            </p>
          )}
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex flex-col space-y-2">
            <Link href="/auth/signin">
              <Button className="w-full">
                Try Again
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full">
                Go Home
              </Button>
            </Link>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              If this problem persists, please{' '}
              <a href="mailto:support@example.com" className="text-blue-600 hover:text-blue-500">
                contact support
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}