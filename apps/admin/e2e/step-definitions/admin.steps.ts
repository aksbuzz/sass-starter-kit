import { Given } from '@cucumber/cucumber'
import type { E2EWorld } from '../support/world.js'
import {
  seedUser,
  seedTenant,
  seedSession,
  makeAccessToken,
  makeRefreshToken,
  setUserPlatformAdmin,
} from '../support/db-helpers.js'


Given('a platform admin user exists', async function (this: E2EWorld) {
  const user = await seedUser({ email: `admin-${Date.now()}@example.com`, name: 'Platform Admin' })
  await setUserPlatformAdmin(user.id, true)
  this.currentUserId = user.id
})

Given('the admin has an active session', async function (this: E2EWorld) {
  if (!this.currentUserId) throw new Error('No user seeded — use "Given a platform admin user exists" first')

  const session = await seedSession({ userId: this.currentUserId })
  this.currentSessionId = session.id

  this.accessToken   = makeAccessToken(this.app, this.currentUserId, session.id, null, null, true)
  this.refreshCookie = makeRefreshToken(this.app, this.currentUserId, session.id)
})

Given('a tenant with slug {string} already exists', async function (this: E2EWorld, slug: string) {
  await seedTenant({ slug, name: `Existing tenant ${slug}` })
})
