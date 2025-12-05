import { PrismaAdapter } from '@next-auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import type { AuthOptions } from 'next-auth'
import { prisma } from './prisma'
import { getEnv } from './env'

const env = getEnv()

export const authOptions: AuthOptions = {
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
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  events: {
    async createUser({ user }) {
      const { events } = await import('./logger')
      events.userCreated(user.id, 'oauth')
    },
    async signIn({ user, account }) {
      const { events } = await import('./logger')
      events.userSignedIn(user.id, account?.provider || 'unknown')
    },
    async signOut({ token }) {
      const { events } = await import('./logger')
      if (token?.sub) {
        events.userSignedOut(token.sub)
      }
    },
  },

  debug: process.env.NODE_ENV === 'development',
}
