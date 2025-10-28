import { authOptions } from '@/lib/auth'

// For NextAuth v4 with App Router compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NextAuth = require('next-auth').default
const handler = NextAuth(authOptions)

export const GET = handler
export const POST = handler