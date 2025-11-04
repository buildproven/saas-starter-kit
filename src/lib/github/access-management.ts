/**
 * GitHub Access Management Service
 *
 * Handles automated GitHub repository access for template customers
 * based on their purchase tier (Pro/Enterprise get private repo access).
 */

import { Octokit } from '@octokit/rest'

interface GitHubAccessParams {
  email: string
  package: 'basic' | 'pro' | 'enterprise'
  saleId: string
  githubUsername?: string | null
}

type ExistingAccess = {
  teamId: string
  inviteUrl?: string
  githubUsername?: string | null
}

interface GitHubAccessResult {
  success: boolean
  teamId?: string
  inviteUrl?: string
  error?: string
  githubUsername?: string | null
}

export async function grantGitHubAccess(params: GitHubAccessParams): Promise<GitHubAccessResult> {
  const { email, package: packageType, saleId } = params
  const normalizedUsername = normalizeGithubUsername(params.githubUsername)

  // Basic tier doesn't get private repo access
  if (packageType === 'basic') {
    return {
      success: true, // Not an error, just no private access needed
    }
  }

  try {
    const octokit = getGitHubClient()

    const accessConfig = getAccessConfiguration(packageType)

    const existing = await checkExistingAccess(octokit, {
      email,
      teamSlug: accessConfig.teamSlug,
      githubUsername: normalizedUsername || undefined,
    })
    if (existing) {
      return {
        success: true,
        teamId: existing.teamId,
        inviteUrl: existing.inviteUrl,
        githubUsername: existing.githubUsername ?? normalizedUsername ?? null,
      }
    }

    const invitation = await inviteToGitHubTeam(octokit, {
      email,
      teamSlug: accessConfig.teamSlug,
      role: accessConfig.role,
      githubUsername: normalizedUsername || undefined,
    })

    await logAccessGrant({
      email,
      packageType,
      saleId,
      teamId: invitation.teamId,
      invitationId: invitation.invitationId,
      githubUsername: invitation.githubUsername,
    })

    return {
      success: true,
      teamId: invitation.teamId,
      inviteUrl: invitation.inviteUrl,
      githubUsername: invitation.githubUsername,
    }
  } catch (error) {
    console.error('Failed to grant GitHub access:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown GitHub API error',
    }
  }
}

function getGitHubClient() {
  const token = process.env.GITHUB_ACCESS_TOKEN
  const org = process.env.GITHUB_ORG

  if (!token || !org) {
    throw new Error(
      'GitHub access requires GITHUB_ACCESS_TOKEN and GITHUB_ORG environment variables'
    )
  }

  return new Octokit({
    auth: token,
  })
}

function getAccessConfiguration(packageType: string) {
  const configs = {
    pro: {
      teamSlug: 'saas-starter-pro',
      role: 'member' as const,
      repositories: ['saas-starter-premium'],
      permissions: ['pull'],
    },
    enterprise: {
      teamSlug: 'saas-starter-enterprise',
      role: 'member' as const,
      repositories: ['saas-starter-premium', 'saas-starter-enterprise'],
      permissions: ['pull', 'triage'],
    },
  }

  return configs[packageType as keyof typeof configs] || configs.pro
}

async function checkExistingAccess(
  octokit: Octokit,
  params: { email: string; teamSlug: string; githubUsername?: string }
): Promise<ExistingAccess | null> {
  const org = process.env.GITHUB_ORG!
  const { email, teamSlug, githubUsername } = params

  if (githubUsername) {
    try {
      const membership = await octokit.rest.teams.getMembershipForUserInOrg({
        org,
        team_slug: teamSlug,
        username: githubUsername,
      })

      if (membership.data?.state === 'active' || membership.data?.state === 'pending') {
        return { teamId: teamSlug, githubUsername }
      }
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status?: number }).status
          : undefined
      if (!(error instanceof Error) || status !== 404) {
        console.warn('GitHub access: unable to resolve existing membership', error)
      }
    }
  }

  try {
    const invitations = await octokit.rest.orgs.listPendingInvitations({ org, per_page: 100 })
    const pending = invitations.data.find((invite) => {
      const matchesEmail = invite.email?.toLowerCase() === email.toLowerCase()
      const matchesUsername =
        githubUsername && invite.login?.toLowerCase() === githubUsername.toLowerCase()
      return matchesEmail || matchesUsername
    })
    if (pending) {
      const normalized = pending.login
        ? pending.login.toLowerCase()
        : githubUsername
          ? githubUsername.toLowerCase()
          : null
      return { teamId: teamSlug, githubUsername: normalized }
    }
  } catch (error) {
    console.warn('GitHub access: unable to list pending invitations', error)
  }

  return null
}

// Note: This is a prototype implementation. In production, replace with actual GitHub API calls

async function inviteToGitHubTeam(
  octokit: Octokit,
  params: {
    email: string
    teamSlug: string
    role: 'member' | 'maintainer'
    githubUsername?: string
  }
): Promise<{
  teamId: string
  invitationId: number
  inviteUrl?: string
  githubUsername: string | null
}> {
  const { email, teamSlug, githubUsername } = params
  const org = process.env.GITHUB_ORG!

  const teamId = await getTeamId(octokit, teamSlug)

  const invitationPayload: {
    org: string
    role: 'direct_member'
    team_ids: number[]
    email?: string
    invitee_id?: number
  } = {
    org,
    role: 'direct_member',
    team_ids: [teamId],
  }

  const normalizedUsername = normalizeGithubUsername(githubUsername)

  if (normalizedUsername) {
    const inviteeId = await getUserIdByUsername(octokit, normalizedUsername)
    if (inviteeId) {
      invitationPayload.invitee_id = inviteeId
    } else {
      console.warn(
        `GitHub access: username ${normalizedUsername} not found, falling back to email invitation`
      )
      invitationPayload.email = email
    }
  } else {
    invitationPayload.email = email
  }

  const invitation = await octokit.rest.orgs.createInvitation(invitationPayload)

  return {
    teamId: teamSlug,
    invitationId: invitation.data.id,
    inviteUrl: undefined,
    githubUsername: normalizedUsername ?? null,
  }
}

async function getTeamId(octokit: Octokit, teamSlug: string): Promise<number> {
  const org = process.env.GITHUB_ORG!
  const team = await octokit.rest.teams.getByName({
    org,
    team_slug: teamSlug,
  })
  return team.data.id
}

async function logAccessGrant(params: {
  email: string
  packageType: string
  saleId: string
  teamId: string
  invitationId: number
  githubUsername: string | null
}): Promise<void> {
  // Log to database or audit system
  console.log('GitHub access granted:', {
    ...params,
    timestamp: new Date().toISOString(),
  })

  // In production, you'd save this to your audit log
}

/**
 * Revoke GitHub access (for subscription cancellations, refunds, etc.)
 */
export async function revokeGitHubAccess(params: {
  email: string
  teamId: string
  reason: string
}): Promise<{ success: boolean; error?: string }> {
  // Log the revocation (prototype implementation)
  console.log('GitHub access revoked:', {
    email: params.email,
    teamId: params.teamId,
    reason: params.reason,
    timestamp: new Date().toISOString(),
  })

  return { success: true }
}

async function getUserIdByUsername(octokit: Octokit, username: string): Promise<number | null> {
  try {
    const user = await octokit.rest.users.getByUsername({ username })
    return user.data.id
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: number }).status
        : undefined
    if (status !== 404) {
      console.warn('GitHub access: failed to load user by username', error)
    }
    return null
  }
}

export function normalizeGithubUsername(username?: string | null): string | null {
  if (!username) return null
  const trimmed = username.trim()
  if (!trimmed) return null
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  if (!withoutAt) return null
  return withoutAt.toLowerCase()
}

async function _emailToGitHubUsername(_email: string): Promise<string | null> {
  // This is a challenging problem - GitHub's API requires username, not email
  // Solutions:
  // 1. Ask for GitHub username during checkout
  // 2. Use GitHub's user search API (limited and not 100% reliable)
  // 3. Require customers to connect their GitHub account to your platform

  // For now, return null to indicate this needs implementation
  return null

  /*
  // Option 2: Search for user by email (not reliable)
  const octokit = getGitHubClient()
  try {
    const result = await octokit.rest.search.users({
      q: `${email} in:email`,
    })

    return result.data.items[0]?.login || null
  } catch (error) {
    return null
  }
  */
}

/**
 * Setup GitHub teams and repositories (run once during initial setup)
 * Note: This is a prototype. In production, implement with actual GitHub API calls.
 */
export async function setupGitHubTeamsAndRepos(): Promise<void> {
  console.log('GitHub teams setup (prototype mode)')

  const teams = ['SaaS Starter Pro', 'SaaS Starter Enterprise']

  teams.forEach((team) => {
    console.log(`Team setup: ${team}`)
  })

  console.log('GitHub teams setup completed (prototype)')
}

/**
 * Environment variables needed:
 * - GITHUB_ACCESS_TOKEN: Personal access token with org management permissions
 * - GITHUB_ORG: Your GitHub organization name
 */
