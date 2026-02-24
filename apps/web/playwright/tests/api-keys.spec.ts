import { test, expect } from '@playwright/test'
import { setupAuth } from '../fixtures/auth'
import {
  mockApiKeysList,
  mockRevokeApiKey,
  MOCK_API_KEY,
} from '../helpers/mock-api'

test.describe('API Keys page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
  })

  test('renders API Keys header', async ({ page }) => {
    await mockApiKeysList(page, [])
    await page.goto('/api-keys')
    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
  })

  test('shows Create key button', async ({ page }) => {
    await mockApiKeysList(page, [])
    await page.goto('/api-keys')
    await expect(page.getByRole('button', { name: /create key/i })).toBeVisible()
  })

  test('shows empty state when no API keys exist', async ({ page }) => {
    await mockApiKeysList(page, [])
    await page.goto('/api-keys')
    await expect(page.getByText('No API keys yet')).toBeVisible()
    await expect(page.getByText('0 keys')).toBeVisible()
  })

  test('shows API key in table when keys exist', async ({ page }) => {
    await mockApiKeysList(page, [MOCK_API_KEY])
    await page.goto('/api-keys')
    await expect(page.getByText('CI Pipeline Key')).toBeVisible()
    await expect(page.getByText(/sk_live_xxxx/)).toBeVisible()
    await expect(page.getByText('1 key')).toBeVisible()
  })

  test('shows Active badge for non-revoked key', async ({ page }) => {
    await mockApiKeysList(page, [MOCK_API_KEY])
    await page.goto('/api-keys')
    await expect(page.getByText('Active')).toBeVisible()
  })

  test('shows Revoked badge for revoked key', async ({ page }) => {
    const revokedKey = { ...MOCK_API_KEY, revokedAt: '2026-02-01T00:00:00Z' }
    await mockApiKeysList(page, [revokedKey])
    await page.goto('/api-keys')
    await expect(page.getByText('Revoked')).toBeVisible()
  })

  test('shows column headers in table', async ({ page }) => {
    await mockApiKeysList(page, [MOCK_API_KEY])
    await page.goto('/api-keys')
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Prefix' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Last used' })).toBeVisible()
  })

  test('shows "Never" for keys with no last-used date', async ({ page }) => {
    await mockApiKeysList(page, [MOCK_API_KEY])
    await page.goto('/api-keys')
    await expect(page.getByText('Never')).toBeVisible()
  })

  test('opens Create API Key dialog on button click', async ({ page }) => {
    await mockApiKeysList(page, [])
    await page.goto('/api-keys')
    await page.getByRole('button', { name: /create key/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('revoke button is visible for active key', async ({ page }) => {
    await mockApiKeysList(page, [MOCK_API_KEY])
    await mockRevokeApiKey(page)
    await page.goto('/api-keys')
    const trashBtn = page.getByRole('button').filter({ has: page.locator('svg') }).first()
    await expect(trashBtn).toBeVisible()
  })

  test('revoke button is hidden for already-revoked key', async ({ page }) => {
    const revokedKey = { ...MOCK_API_KEY, revokedAt: '2026-02-01T00:00:00Z' }
    await mockApiKeysList(page, [revokedKey])
    await page.goto('/api-keys')
    await expect(page.locator('[class*="text-destructive"]').filter({ has: page.locator('button') })).not.toBeVisible()
  })
})
