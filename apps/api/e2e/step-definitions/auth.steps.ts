import { Given, When, Then } from '@cucumber/cucumber'
import assert               from 'node:assert/strict'
import type { E2EWorld }    from '../support/world.js'
import {
  seedUser,
  seedSession,
  makeAccessToken,
  makeRefreshToken,
} from '../support/db-helpers.js'


Given('a seeded user exists', async function (this: E2EWorld) {
  const user = await seedUser()
  this.currentUserId = user.id
})

Given('the user has an active session', async function (this: E2EWorld) {
  if (!this.currentUserId) throw new Error('No user seeded — use "Given a seeded user exists" first')

  const session = await seedSession({ userId: this.currentUserId })
  this.currentSessionId = session.id

  // Access token without tenantId (not yet in a workspace)
  this.accessToken  = makeAccessToken(this.app, this.currentUserId, session.id)
  this.refreshCookie = makeRefreshToken(this.app, this.currentUserId, session.id)
})

Given('the user has an active session without workspace', async function (this: E2EWorld) {
  if (!this.currentUserId) throw new Error('No user seeded — use "Given a seeded user exists" first')

  const session = await seedSession({ userId: this.currentUserId })
  this.currentSessionId = session.id

  // Access token without tenantId — workspace-scoped routes should reject it
  this.accessToken   = makeAccessToken(this.app, this.currentUserId, session.id, null, null)
  this.refreshCookie = makeRefreshToken(this.app, this.currentUserId, session.id)
})


When('I POST {string} with the refresh cookie', async function (this: E2EWorld, path: string) {
  assert.ok(this.refreshCookie, 'No refresh cookie — seed a session first')
  await this.request({
    method:  'POST',
    url:     path,
    headers: { Cookie: `refresh_token=${this.refreshCookie}` },
  })
})

When('I POST {string} with no cookie', async function (this: E2EWorld, path: string) {
  await this.request({ method: 'POST', url: path })
})

When('I DELETE {string} with the refresh cookie', async function (this: E2EWorld, path: string) {
  assert.ok(this.refreshCookie, 'No refresh cookie — seed a session first')
  await this.request({
    method:  'DELETE',
    url:     path,
    headers: {
      Authorization: `Bearer ${this.accessToken}`,
      Cookie:        `refresh_token=${this.refreshCookie}`,
    },
  })
})

Then(
  'a subsequent POST {string} with the same cookie returns {int}',
  async function (this: E2EWorld, path: string, expectedStatus: number) {
    assert.ok(this.refreshCookie, 'No refresh cookie stored')
    const res = await this.app.inject({
      method:  'POST',
      url:     path,
      headers: { Cookie: `refresh_token=${this.refreshCookie}` },
    })
    assert.equal(
      res.statusCode,
      expectedStatus,
      `Expected status ${expectedStatus}, got ${res.statusCode}. Body: ${res.body}`,
    )
  },
)
