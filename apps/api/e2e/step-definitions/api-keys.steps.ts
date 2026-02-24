import { Given, When } from '@cucumber/cucumber'
import assert          from 'node:assert/strict'
import type { E2EWorld } from '../support/world.js'


Given('an API key exists for the current tenant', async function (this: E2EWorld) {
  const res = await this.authRequest({
    method:  'POST',
    url:     '/api-keys',
    payload: { name: 'Fixture key', scopes: ['read'] },
    headers: { 'Content-Type': 'application/json' },
  })

  assert.equal(
    res.statusCode,
    201,
    `Failed to create fixture API key: ${res.body}`,
  )

  const body         = JSON.parse(res.body) as { apiKey: { id: string } }
  this.lastCreatedId = body.apiKey.id
})


When('I DELETE {string} using the stored key id', async function (this: E2EWorld, pathTemplate: string) {
  assert.ok(this.lastCreatedId, 'No key id stored — use "Given an API key exists" first')
  const path = pathTemplate.replace(':id', this.lastCreatedId)
  await this.authRequest({ method: 'DELETE', url: path })
})
