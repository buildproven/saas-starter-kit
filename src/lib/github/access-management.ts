/**
 * GitHub Access Management Service
 *
 * Handles automated GitHub repository access for template customers
 * based on their purchase tier (Pro/Enterprise get private repo access).
 */

interface GitHubAccessParams {
  email: string
  package: 'basic' | 'pro' | 'enterprise'
  saleId: string
}

interface GitHubAccessResult {
  success: boolean
  teamId?: string
  inviteUrl?: string
  error?: string
}

export async function grantGitHubAccess(params: GitHubAccessParams): Promise<GitHubAccessResult> {
  const { email, package: packageType, saleId } = params

  // Basic tier doesn't get private repo access
  if (packageType === 'basic') {
    return {
      success: true, // Not an error, just no private access needed
    }
  }

  try {
    const octokit = getGitHubClient()

    // Get the appropriate team and repository based on package tier
    const accessConfig = getAccessConfiguration(packageType)

    // Check if user already has access (always returns null in prototype)
    await checkExistingAccess(octokit, email, accessConfig.teamSlug)

    // Invite user to the appropriate GitHub team (mock implementation)
    const invitation = {
      teamId: accessConfig.teamSlug,
      invitationId: Math.floor(Math.random() * 10000),
      inviteUrl: `https://github.com/orgs/${process.env.GITHUB_ORG}/invitations/mock-${Date.now()}`,
    }

    // Log the access grant for audit purposes
    await logAccessGrant({
      email,
      packageType,
      saleId,
      teamId: invitation.teamId,
      invitationId: invitation.invitationId,
    })

    return {
      success: true,
      teamId: invitation.teamId,
      inviteUrl: invitation.inviteUrl,
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
  // Initialize GitHub API client (Octokit)
  if (!process.env.GITHUB_ACCESS_TOKEN) {
    throw new Error('GITHUB_ACCESS_TOKEN not configured')
  }

  // In a real implementation, you'd import and configure Octokit:
  /*
  import { Octokit } from '@octokit/rest'

  return new Octokit({
    auth: process.env.GITHUB_ACCESS_TOKEN,
  })
  */

  // Mock for development
  return {
    rest: {
      teams: {
        getMembershipForUserInOrg: async () => ({ data: null }),
        addOrUpdateMembershipForUserInOrg: async () => ({
          data: { url: 'https://github.com/orgs/yourorg/teams/premium/members/username' }
        }),
      },
      orgs: {
        createInvitation: async () => ({
          data: {
            id: 12345,
            invitation_url: 'https://github.com/orgs/yourorg/invitations/token123',
          }
        }),
      },
    },
  }
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

async function checkExistingAccess(_octokit: unknown, _email: string, _teamSlug: string) {
  // Convert email to GitHub username (this is tricky - GitHub API needs username, not email)
  // In production, you'd either:
  // 1. Ask for GitHub username during purchase
  // 2. Use GitHub's user search API
  // 3. Store username mapping in your database

  // For now, return null (no existing access)
  return null
}

// Note: This is a prototype implementation. In production, replace with actual GitHub API calls

async function _getTeamId(_octokit: unknown, teamSlug: string): Promise<number> {
  // In production, you'd fetch the team ID:
  /*
  const team = await octokit.rest.teams.getByName({
    org: process.env.GITHUB_ORG,
    team_slug: teamSlug,
  })
  return team.data.id
  */

  // Mock team IDs for development
  const teamIds = {
    'saas-starter-pro': 1001,
    'saas-starter-enterprise': 1002,
  }

  return teamIds[teamSlug as keyof typeof teamIds] || 1001
}

async function logAccessGrant(params: {
  email: string
  packageType: string
  saleId: string
  teamId: string
  invitationId: number
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

  const teams = [
    'SaaS Starter Pro',
    'SaaS Starter Enterprise',
  ]

  teams.forEach(team => {
    console.log(`Team setup: ${team}`)
  })

  console.log('GitHub teams setup completed (prototype)')
}

/**
 * Environment variables needed:
 * - GITHUB_ACCESS_TOKEN: Personal access token with org management permissions
 * - GITHUB_ORG: Your GitHub organization name
 */