import { Given } from '@cucumber/cucumber'
import type { E2EWorld } from '../support/world.js'
import {
  seedTenant,
  seedMembership,
  seedSession,
  makeAccessToken,
  makeRefreshToken,
  getStarterPlanId,
} from '../support/db-helpers.js'


Given('the user has an active workspace session', async function (this: E2EWorld) {
  if (!this.currentUserId) throw new Error('No user seeded — use "Given a seeded user exists" first')

  // Create tenant + membership if one does not already exist for this scenario
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

Given('a tenant with slug {string} already exists', async function (this: E2EWorld, slug: string) {
  await seedTenant({ slug, name: `Existing tenant ${slug}` })
})
