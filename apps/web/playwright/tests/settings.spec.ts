import { test, expect } from '@playwright/test'
import { setupAuth } from '../fixtures/auth'
import { mockWorkspaceMe, mockUpdateTenant, mockDeleteTenant } from '../helpers/mock-api'

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
    await mockWorkspaceMe(page)
  })

  test('renders Settings header', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test('shows General settings card', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('General')).toBeVisible()
    await expect(page.getByText('Update your workspace name and URL slug')).toBeVisible()
  })

  test('workspace name field is pre-filled from API', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByLabel('Workspace name')).toHaveValue('Acme Corp')
  })

  test('workspace slug field is pre-filled from API', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByLabel('URL slug')).toHaveValue('acme-corp')
  })

  test('shows Danger zone card', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('Danger zone')).toBeVisible()
    await expect(page.getByText('Permanently delete this workspace and all its data')).toBeVisible()
  })

  test('shows Delete workspace button in Danger Zone', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: 'Delete workspace' })).toBeVisible()
  })

  test('Save changes button is present in general settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible()
  })

  test('Delete workspace dialog shows workspace name for confirmation', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Delete workspace' }).click()
    await expect(page.getByText(/Type.*to confirm/)).toBeVisible()
    await expect(page.getByRole('dialog').getByText('Acme Corp')).toBeVisible()
  })
})
