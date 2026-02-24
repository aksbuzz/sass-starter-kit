import { test, expect } from '@playwright/test'
import { setupAuth } from '../fixtures/auth'
import { mockWorkspaceMe, MOCK_WORKSPACE_CONTEXT } from '../helpers/mock-api'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
    await mockWorkspaceMe(page)
  })

  test('renders Dashboard header', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('shows workspace name card', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Acme Corp')).toBeVisible()
    await expect(page.getByText('/acme-corp')).toBeVisible()
  })

  test('shows current user role', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/your role/i)).toBeVisible()
    await expect(page.getByText('owner')).toBeVisible()
  })

  test('shows Feature flags section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Feature flags')).toBeVisible()
    await expect(page.getByText('Active features on your current plan')).toBeVisible()
  })

  test('shows sidebar navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /team/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /api keys/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /billing/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /webhooks/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /audit log/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /settings/i })).toBeVisible()
  })

  test('shows overview cards with workspace stats', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('1')).toBeVisible()
    await expect(page.getByText('Starter')).toBeVisible()
  })

  test('shows isolation mode', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/isolation/i)).toBeVisible()
    await expect(page.getByText('shared')).toBeVisible()
  })

  test('redirects to /workspace-picker if no tenantId in token', async ({ page }) => {
    await setupAuth(page, { tenantId: null, role: null })
    await page.goto('/')
    await expect(page).toHaveURL(/workspace-picker/, { timeout: 8_000 })
  })
})
