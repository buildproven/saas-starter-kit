// NextAuth types are included from the providers
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import { prisma } from './prisma'
import { getEnv } from './env'

const env = getEnv()

export const authOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? [
          GitHubProvider({
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },

  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      if (session.user && token) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
  },

  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  events: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async createUser({ user }: any) {
      const { events } = await import('./logger')
      events.userCreated(user.id, 'oauth')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account }: any) {
      const { events } = await import('./logger')
      events.userSignedIn(user.id, account?.provider || 'unknown')
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signOut({ session }: any) {
      const { events } = await import('./logger')
      if (session?.user?.id) {
        events.userSignedOut(session.user.id)
      }
    },
  },

  debug: process.env.NODE_ENV === 'development',
}
