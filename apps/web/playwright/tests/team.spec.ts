import { test, expect } from '@playwright/test'
import { setupAuth } from '../fixtures/auth'
import { mockMembersList, MOCK_MEMBER } from '../helpers/mock-api'

test.describe('Team page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page, { role: 'owner' })
  })

  test('renders Team header', async ({ page }) => {
    await mockMembersList(page, [MOCK_MEMBER])
    await page.goto('/team')
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
  })

  test('shows member count', async ({ page }) => {
    await mockMembersList(page, [MOCK_MEMBER])
    await page.goto('/team')
    await expect(page.getByText('1 member')).toBeVisible()
  })

  test('shows plural "members" for count > 1', async ({ page }) => {
    const second = { ...MOCK_MEMBER, id: 'mem-2', userId: 'user-2' }
    await mockMembersList(page, [MOCK_MEMBER, second])
    await page.goto('/team')
    await expect(page.getByText('2 members')).toBeVisible()
  })

  test('shows Invite member button for owner', async ({ page }) => {
    await mockMembersList(page, [MOCK_MEMBER])
    await page.goto('/team')
    await expect(page.getByRole('button', { name: /invite member/i })).toBeVisible()
  })

  test('hides Invite member button for member role', async ({ page }) => {
    await setupAuth(page, { role: 'member' })
    await mockMembersList(page, [MOCK_MEMBER])
    await page.goto('/team')
    await expect(page.getByRole('button', { name: /invite member/i })).not.toBeVisible()
  })

  test('shows Invite member button for admin role', async ({ page }) => {
    await setupAuth(page, { role: 'admin' })
    await mockMembersList(page, [MOCK_MEMBER])
    await page.goto('/team')
    await expect(page.getByRole('button', { name: /invite member/i })).toBeVisible()
  })

  test('shows member email in table', async ({ page }) => {
    await mockMembersList(page, [MOCK_MEMBER])
    await page.goto('/team')
    await expect(page.getByText('owner@example.com')).toBeVisible()
  })

  test('shows empty member table for 0 members', async ({ page }) => {
    await mockMembersList(page, [])
    await page.goto('/team')
    await expect(page.getByText('0 members')).toBeVisible()
  })

  test('opens Invite Member dialog on button click', async ({ page }) => {
    await mockMembersList(page, [MOCK_MEMBER])
    await page.goto('/team')
    await page.getByRole('button', { name: /invite member/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
