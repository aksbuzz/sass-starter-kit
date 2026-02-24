import { BeforeAll, AfterAll, Before, setDefaultTimeout } from '@cucumber/cucumber'
import { buildApp }      from '../../src/app.js'
import { adminSql }      from '@saas/db'
import { setSharedApp }  from './world.js'
import { cleanDatabase, ensureAuditPartition } from './db-helpers.js'
import type { E2EWorld } from './world.js'
import type { FastifyInstance } from 'fastify'

setDefaultTimeout(15_000)

let _app: FastifyInstance | undefined

// ---------------------------------------------------------------------------
// BeforeAll — build the Fastify app once for the whole test run.
// Using inject() means no port is opened; tests run in-process.
// ---------------------------------------------------------------------------
BeforeAll(async function () {
  const app = await buildApp()

  await app.ready()

  _app = app
  setSharedApp(app)

  // Ensure the current-month audit_logs partition exists so INSERTs don't fail
  await ensureAuditPartition()
})

AfterAll(async function () {
  if (_app) {
    await _app.close()
  }
  await adminSql.end()
})

Before(async function (this: E2EWorld) {
  this.lastResponse     = null
  this.accessToken      = null
  this.refreshCookie    = null
  this.currentUserId    = null
  this.currentSessionId = null
  this.currentTenantId  = null
  this.lastCreatedId    = null

  await cleanDatabase()
})
