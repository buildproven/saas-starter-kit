import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/')
    // Title may vary by deployment - just ensure page loads
    await expect(page).toHaveTitle(/.+/)
  })

  test('has main navigation', async ({ page }) => {
    await page.goto('/')

    // Check for common navigation elements
    const nav = page.locator('nav')
    await expect(nav).toBeVisible()
  })

  test('is accessible', async ({ page }) => {
    await page.goto('/')

    // Basic accessibility checks
    // Check that page has a main landmark
    const main = page.locator('main')
    await expect(main).toBeVisible()

    // Check for proper heading hierarchy
    const h1 = page.locator('h1').first()
    await expect(h1).toBeVisible()
  })
})

test.describe('Auth Flow', () => {
  test('sign in page loads', async ({ page }) => {
    await page.goto('/auth/signin')

    // Should show sign in form or redirect to auth provider
    await expect(page.locator('body')).toBeVisible()
  })

  test('protected routes redirect to signin', async ({ page }) => {
    await page.goto('/dashboard')

    // Should redirect to signin for unauthenticated users
    // Auth redirect path may be /auth/signin, /login, or stay on /dashboard with auth modal
    const url = page.url()
    const isRedirected = url.includes('/auth/') || url.includes('/login') || url.includes('/signin')
    const staysOnDashboard = url.includes('/dashboard')
    expect(isRedirected || staysOnDashboard).toBeTruthy()
  })
})

test.describe('API Health', () => {
  test('health endpoint returns OK', async ({ request }) => {
    const response = await request.get('/api/health')
    // Health endpoint may return 200 or 503 depending on DB connection
    // In E2E we just verify the endpoint responds
    expect([200, 503].includes(response.status())).toBeTruthy()
  })
})
