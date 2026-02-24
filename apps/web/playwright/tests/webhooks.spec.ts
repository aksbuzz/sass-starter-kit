import { test, expect } from '@playwright/test'
import { setupAuth } from '../fixtures/auth'
import { mockWebhooksList, MOCK_WEBHOOK } from '../helpers/mock-api'

test.describe('Webhooks page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
  })

  test('renders Webhooks header', async ({ page }) => {
    await mockWebhooksList(page, [])
    await page.goto('/webhooks')
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible()
  })

  test('shows Add webhook button', async ({ page }) => {
    await mockWebhooksList(page, [])
    await page.goto('/webhooks')
    await expect(page.getByRole('button', { name: /add webhook/i })).toBeVisible()
  })

  test('shows empty state when no webhooks exist', async ({ page }) => {
    await mockWebhooksList(page, [])
    await page.goto('/webhooks')
    await expect(page.getByText('No webhooks yet. Add one to start receiving events.')).toBeVisible()
    await expect(page.getByText('0 endpoints')).toBeVisible()
  })

  test('shows webhook URL in table', async ({ page }) => {
    await mockWebhooksList(page, [MOCK_WEBHOOK])
    await page.goto('/webhooks')
    await expect(page.getByText('https://webhook.site/test-endpoint')).toBeVisible()
  })

  test('shows endpoint count', async ({ page }) => {
    await mockWebhooksList(page, [MOCK_WEBHOOK])
    await page.goto('/webhooks')
    await expect(page.getByText('1 endpoint')).toBeVisible()
  })

  test('shows plural "endpoints" for count > 1', async ({ page }) => {
    const second = { ...MOCK_WEBHOOK, id: 'webhook-2', url: 'https://other.site/endpoint' }
    await mockWebhooksList(page, [MOCK_WEBHOOK, second])
    await page.goto('/webhooks')
    await expect(page.getByText('2 endpoints')).toBeVisible()
  })

  test('opens Create Webhook dialog on button click', async ({ page }) => {
    await mockWebhooksList(page, [])
    await page.goto('/webhooks')
    await page.getByRole('button', { name: /add webhook/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
