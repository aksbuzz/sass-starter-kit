import { When, Then } from '@cucumber/cucumber'
import assert         from 'node:assert/strict'
import type { E2EWorld } from '../support/world.js'


When('I GET {string}', async function (this: E2EWorld, path: string) {
  await this.authRequest({ method: 'GET', url: path })
})

When('I GET {string} without authentication', async function (this: E2EWorld, path: string) {
  await this.request({ method: 'GET', url: path })
})

When('I GET {string} with that session', async function (this: E2EWorld, path: string) {
  // Uses the access token set by the most recent "Given" step
  await this.authRequest({ method: 'GET', url: path })
})

When('I DELETE {string}', async function (this: E2EWorld, path: string) {
  await this.authRequest({ method: 'DELETE', url: path })
})

When('I POST {string} with body:', async function (this: E2EWorld, path: string, body: string) {
  await this.authRequest({
    method:  'POST',
    url:     path,
    payload: JSON.parse(body),
    headers: { 'Content-Type': 'application/json' },
  })
})


Then('the response status is {int}', function (this: E2EWorld, status: number) {
  assert.ok(this.lastResponse, 'No response recorded — did you make an HTTP request?')
  assert.equal(
    this.lastResponse.statusCode,
    status,
    `Expected status ${status}, got ${this.lastResponse.statusCode}. Body: ${this.lastResponse.body}`,
  )
})

Then('the response body has field {string}', function (this: E2EWorld, field: string) {
  assert.ok(this.lastResponse, 'No response recorded')
  const body = JSON.parse(this.lastResponse.body)
  // Support dot-notation: "tenant.id"
  const value = field.split('.').reduce((obj: unknown, key) => {
    if (obj !== null && typeof obj === 'object') return (obj as Record<string, unknown>)[key]
    return undefined
  }, body as unknown)
  assert.notEqual(value, undefined, `Field "${field}" not found in body: ${this.lastResponse.body}`)
})

Then('the response body has field {string} equal to {string}', function (
  this: E2EWorld,
  field: string,
  expected: string,
) {
  assert.ok(this.lastResponse, 'No response recorded')
  const body = JSON.parse(this.lastResponse.body)
  const value = field.split('.').reduce((obj: unknown, key) => {
    if (obj !== null && typeof obj === 'object') return (obj as Record<string, unknown>)[key]
    return undefined
  }, body as unknown)
  assert.equal(String(value), expected, `Field "${field}" expected "${expected}", got "${value}"`)
})

Then('the response body is an array', function (this: E2EWorld) {
  assert.ok(this.lastResponse, 'No response recorded')
  const body = JSON.parse(this.lastResponse.body)
  assert.ok(Array.isArray(body), `Expected array, got: ${this.lastResponse.body}`)
})
