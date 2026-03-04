import { test, expect, type Page } from '@playwright/test'
import { setupAuth, createMockJwt } from '../fixtures/auth'
import {
  mockTenantsList,
  mockCreateTenant,
  mockSelectWorkspace,
  mockWorkspaceMe,
  MOCK_WORKSPACES,
} from '../helpers/mock-api'

async function goToWorkspacePicker(
  page: Page,
  workspaces: typeof MOCK_WORKSPACES | [] = [],
  isPlatformAdmin = false,
) {
  await setupAuth(page, { tenantId: null, role: null, ipa: isPlatformAdmin })
  await mockTenantsList(page, workspaces)
  await page.goto('/workspace-picker')
}

test.describe('Workspace Picker', () => {
  test('shows heading and description', async ({ page }) => {
    await goToWorkspacePicker(page)
    await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible()
    await expect(page.getByText('Select a workspace to continue')).toBeVisible()
  })

  test('shows "Create a new workspace" button for platform admins', async ({ page }) => {
    await goToWorkspacePicker(page, [], true)
    await expect(page.getByRole('button', { name: /create a new workspace/i })).toBeVisible()
  })

  test('does not show "Create a new workspace" button for regular users', async ({ page }) => {
    await goToWorkspacePicker(page)
    await expect(page.getByRole('button', { name: /create a new workspace/i })).not.toBeVisible()
  })

  test('shows empty-state message for non-admin with no workspaces', async ({ page }) => {
    await goToWorkspacePicker(page)
    await expect(page.getByText("You haven't been added to any workspace yet")).toBeVisible()
  })

  test('shows workspace list when multiple workspaces exist', async ({ page }) => {
    const selectToken = createMockJwt({ tenantId: MOCK_WORKSPACES[0]!.tenantId })
    await mockSelectWorkspace(page, selectToken)
    await goToWorkspacePicker(page, MOCK_WORKSPACES)

    await expect(page.getByText('Acme Corp')).toBeVisible()
    await expect(page.getByText('Second Org')).toBeVisible()
  })

  test('shows workspace slugs', async ({ page }) => {
    const selectToken = createMockJwt({ tenantId: MOCK_WORKSPACES[0]!.tenantId })
    await mockSelectWorkspace(page, selectToken)
    await goToWorkspacePicker(page, MOCK_WORKSPACES)

    await expect(page.getByText('acme-corp')).toBeVisible()
    await expect(page.getByText('second-org')).toBeVisible()
  })

  test('shows role badges for workspaces', async ({ page }) => {
    const selectToken = createMockJwt({ tenantId: MOCK_WORKSPACES[0]!.tenantId })
    await mockSelectWorkspace(page, selectToken)
    await goToWorkspacePicker(page, MOCK_WORKSPACES)

    await expect(page.getByText('Owner')).toBeVisible()
    await expect(page.getByText('Member')).toBeVisible()
  })

  test('shows create workspace form when button clicked (platform admin)', async ({ page }) => {
    await goToWorkspacePicker(page, [], true)

    await page.getByRole('button', { name: /create a new workspace/i }).click()
    await expect(page.getByText('New workspace', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Name')).toBeVisible()
    await expect(page.getByLabel('Slug (optional)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
  })

  test('Create button is disabled when name is empty', async ({ page }) => {
    await goToWorkspacePicker(page, [], true)

    await page.getByRole('button', { name: /create a new workspace/i }).click()
    await expect(page.getByRole('button', { name: 'Create' })).toBeDisabled()
  })

  test('Create button is enabled after entering workspace name', async ({ page }) => {
    await goToWorkspacePicker(page, [], true)

    await page.getByRole('button', { name: /create a new workspace/i }).click()
    await page.getByLabel('Name').fill('My New Workspace')
    await expect(page.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  test('Cancel hides the create form', async ({ page }) => {
    await goToWorkspacePicker(page, [], true)

    await page.getByRole('button', { name: /create a new workspace/i }).click()
    await expect(page.getByText('New workspace', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('New workspace', { exact: true })).not.toBeVisible()
  })

  test('creating a workspace calls POST /admin/tenants and POST /auth/workspace', async ({ page }) => {
    const selectToken = createMockJwt({ tenantId: 'tenant-new' })
    await goToWorkspacePicker(page, [], true)
    await mockCreateTenant(page)
    await mockSelectWorkspace(page, selectToken)

    await page.getByRole('button', { name: /create a new workspace/i }).click()
    await page.getByLabel('Name').fill('Acme Corp')

    const [createReq, selectReq] = await Promise.all([
      page.waitForRequest(
        req => req.method() === 'POST' && req.url().endsWith('/admin/tenants'),
        { timeout: 8_000 },
      ),
      page.waitForRequest(
        req => req.method() === 'POST' && req.url().endsWith('/auth/workspace'),
        { timeout: 8_000 },
      ),
      page.getByRole('button', { name: 'Create' }).click(),
    ])

    expect(createReq.postDataJSON()).toMatchObject({ name: 'Acme Corp' })
    expect(selectReq.postDataJSON()).toMatchObject({ tenantId: 'tenant-test-123' })
  })
})
