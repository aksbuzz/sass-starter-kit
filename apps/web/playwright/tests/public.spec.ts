import { test, expect } from '@playwright/test'

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('renders sign-in card', async ({ page }) => {
    await expect(page.getByText('Sign in')).toBeVisible()
    await expect(page.getByText('Continue with your OAuth provider')).toBeVisible()
  })

  test('has Continue with Google button', async ({ page }) => {
    const googleLink = page.getByRole('link', { name: /continue with google/i })
    await expect(googleLink).toBeVisible()
    const href = await googleLink.getAttribute('href')
    expect(href).toContain('/auth/google')
  })

  test('has Continue with GitHub button', async ({ page }) => {
    const githubLink = page.getByRole('link', { name: /continue with github/i })
    await expect(githubLink).toBeVisible()
    const href = await githubLink.getAttribute('href')
    expect(href).toContain('/auth/github')
  })

  test('shows terms of service notice', async ({ page }) => {
    await expect(page.getByText(/terms of service/i)).toBeVisible()
  })
})

test.describe('Route protection (unauthenticated)', () => {
  test('dashboard / redirects to /login without session', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/team redirects to /login without session', async ({ page }) => {
    await page.goto('/team')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/api-keys redirects to /login without session', async ({ page }) => {
    await page.goto('/api-keys')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/billing redirects to /login without session', async ({ page }) => {
    await page.goto('/billing')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/webhooks redirects to /login without session', async ({ page }) => {
    await page.goto('/webhooks')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/settings redirects to /login without session', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/audit-log redirects to /login without session', async ({ page }) => {
    await page.goto('/audit-log')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/workspace-picker is accessible without session', async ({ page }) => {
    await page.goto('/workspace-picker')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.getByText('Choose a workspace')).toBeVisible()
  })
})
