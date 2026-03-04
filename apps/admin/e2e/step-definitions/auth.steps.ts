import { Given } from '@cucumber/cucumber'
import type { E2EWorld }    from '../support/world.js'
import {
  seedUser,
  seedTenant,
  seedMembership,
  seedSession,
  makeAccessToken,
  makeRefreshToken,
  getStarterPlanId,
} from '../support/db-helpers.js'


Given('a seeded user exists', async function (this: E2EWorld) {
  const user = await seedUser()
  this.currentUserId = user.id
})

Given('the user has an active session', async function (this: E2EWorld) {
  if (!this.currentUserId) throw new Error('No user seeded — use "Given a seeded user exists" first')

  const session = await seedSession({ userId: this.currentUserId })
  this.currentSessionId = session.id

  this.accessToken  = makeAccessToken(this.app, this.currentUserId, session.id)
  this.refreshCookie = makeRefreshToken(this.app, this.currentUserId, session.id)
})

Given('the user has an active workspace session', async function (this: E2EWorld) {
  if (!this.currentUserId) throw new Error('No user seeded — use "Given a seeded user exists" first')

  const tenant = await seedTenant()
  this.currentTenantId = tenant.id

  await seedMembership(tenant.id, this.currentUserId, 'owner')

  const planId   = await getStarterPlanId()
  const session  = await seedSession({
    userId:   this.currentUserId,
    tenantId: tenant.id,
    data: {
      role:     'owner',
      planId,
      planSlug: 'starter',
    },
  })

  this.currentSessionId = session.id
  this.accessToken      = makeAccessToken(
    this.app,
    this.currentUserId,
    session.id,
    tenant.id,
    'owner',
  )
  this.refreshCookie    = makeRefreshToken(this.app, this.currentUserId, session.id)
})
