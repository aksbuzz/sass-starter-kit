import { test, expect } from '@playwright/test'
import { setupAuth } from '../fixtures/auth'
import { mockAuditLogs, MOCK_AUDIT_LOG } from '../helpers/mock-api'

test.describe('Audit Log page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
  })

  test('renders Audit Log header', async ({ page }) => {
    await mockAuditLogs(page, [])
    await page.goto('/audit-log')
    await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
  })

  test('shows empty state when no log entries exist', async ({ page }) => {
    await mockAuditLogs(page, [])
    await page.goto('/audit-log')
    await expect(page.getByText('No audit log entries')).toBeVisible()
  })

  test('shows audit log table columns when entries exist', async ({ page }) => {
    await mockAuditLogs(page, [MOCK_AUDIT_LOG])
    await page.goto('/audit-log')
    await expect(page.getByRole('columnheader', { name: 'Action' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Resource' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'User' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible()
  })

  test('shows action badge for audit log entry', async ({ page }) => {
    await mockAuditLogs(page, [MOCK_AUDIT_LOG])
    await page.goto('/audit-log')
    await expect(page.getByText('api_key.created')).toBeVisible()
  })

  test('shows resource type in Resource column', async ({ page }) => {
    await mockAuditLogs(page, [MOCK_AUDIT_LOG])
    await page.goto('/audit-log')
    const resourceCell = page.getByRole('cell').filter({ hasText: /^api_key/ })
    await expect(resourceCell.first()).toBeVisible()
  })

  test('shows truncated user ID', async ({ page }) => {
    await mockAuditLogs(page, [MOCK_AUDIT_LOG])
    await page.goto('/audit-log')
    await expect(page.getByText(/user-tes/)).toBeVisible()
  })

  test('does not show pagination controls when only 1 page', async ({ page }) => {
    await mockAuditLogs(page, [MOCK_AUDIT_LOG])
    await page.goto('/audit-log')
    await expect(page.getByText(/page \d+ of/i)).not.toBeVisible()
  })

  test('shows multiple log entries in table', async ({ page }) => {
    const secondLog = {
      ...MOCK_AUDIT_LOG,
      id: 'auditlog-2',
      action: 'member.invited',
      resourceType: 'invitation',
    }
    await mockAuditLogs(page, [MOCK_AUDIT_LOG, secondLog])
    await page.goto('/audit-log')
    await expect(page.getByText('api_key.created')).toBeVisible()
    await expect(page.getByText('member.invited')).toBeVisible()
  })
})
