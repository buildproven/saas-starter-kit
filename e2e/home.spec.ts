import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/SaaS/)
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
    await expect(page.url()).toContain('/auth/signin')
  })
})

test.describe('API Health', () => {
  test('health endpoint returns OK', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()
  })
})
