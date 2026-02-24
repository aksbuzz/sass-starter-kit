import { test, expect } from '@playwright/test'
import { setupAuth } from '../fixtures/auth'
import {
  mockBillingSubscription,
  mockBillingPlans,
  MOCK_SUBSCRIPTION,
  MOCK_PLAN,
} from '../helpers/mock-api'

const MOCK_PLAN_GROWTH = {
  id: 'plan-growth',
  name: 'Growth',
  slug: 'growth',
  tier: 1,
  priceMonthlyCents: 2900,
  priceYearlyCents: 29000,
  limits: { maxMembers: 25, maxApiKeys: 20, maxWebhooks: 10 },
  features: { sso: false, webhooks: true, advancedAnalytics: true, prioritySupport: false },
  isPublic: true,
  isActive: true,
}

const MOCK_PLAN_CORRECT = {
  ...MOCK_PLAN,
  limits: { maxMembers: 5, maxApiKeys: 5, maxWebhooks: 3 },
  features: { sso: false, webhooks: false, advancedAnalytics: false, prioritySupport: false },
}

const MOCK_SUB_CORRECT = {
  ...MOCK_SUBSCRIPTION,
  plan: MOCK_PLAN_CORRECT,
}

test.describe('Billing page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
    await mockBillingSubscription(page, MOCK_SUB_CORRECT)
    await mockBillingPlans(page, [MOCK_PLAN_CORRECT, MOCK_PLAN_GROWTH])
  })

  test('renders Billing header', async ({ page }) => {
    await page.goto('/billing')
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  })

  test('shows Available plans section', async ({ page }) => {
    await page.goto('/billing')
    await expect(page.getByText('Available plans')).toBeVisible()
  })

  test('shows plan names from API', async ({ page }) => {
    await page.goto('/billing')
    await expect(page.getByText('Starter').first()).toBeVisible()
    await expect(page.getByText('Growth').first()).toBeVisible()
  })

  test('shows current subscription status — trialing', async ({ page }) => {
    await page.goto('/billing')
    await expect(page.getByText('trialing')).toBeVisible()
  })

  test('shows trial end date label and formatted date', async ({ page }) => {
    await page.goto('/billing')
    await expect(page.getByText(/Trial ends/)).toBeVisible()
    await expect(page.getByText(/Mar \d+, 2026/).first()).toBeVisible()
  })

  test('shows Manage billing button for active subscription', async ({ page }) => {
    await page.goto('/billing')
    await expect(page.getByRole('button', { name: /manage billing/i })).toBeVisible()
  })

  test('shows Upgrade plan button for trialing subscription', async ({ page }) => {
    await page.goto('/billing')
    await expect(page.getByRole('button', { name: /upgrade plan/i })).toBeVisible()
  })

  test('shows "No subscription" when subscription is null', async ({ page }) => {
    await mockBillingSubscription(page, null as any)
    await page.goto('/billing')
    await expect(page.getByText('No subscription')).toBeVisible()
  })
})
