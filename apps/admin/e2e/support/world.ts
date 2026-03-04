import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber'
import type { FastifyInstance }                       from 'fastify'
import type { InjectOptions, LightMyRequestResponse } from 'fastify'

export interface E2EWorld extends World {
  app:             FastifyInstance
  lastResponse:    LightMyRequestResponse | null
  accessToken:     string | null
  refreshCookie:   string | null
  currentUserId:   string | null
  currentSessionId: string | null
  currentTenantId: string | null
  lastCreatedId:   string | null

  /** Inject an HTTP request into the Fastify app */
  request(opts: InjectOptions): Promise<LightMyRequestResponse>

  /** Inject with Authorization: Bearer <accessToken> already set. */
  authRequest(opts: InjectOptions): Promise<LightMyRequestResponse>
}

export let sharedApp: FastifyInstance | undefined

export function setSharedApp(app: FastifyInstance): void {
  sharedApp = app
}

class SaasWorld extends World implements E2EWorld {
  app:              FastifyInstance
  lastResponse:     LightMyRequestResponse | null  = null
  accessToken:      string | null                  = null
  refreshCookie:    string | null                  = null
  currentUserId:    string | null                  = null
  currentSessionId: string | null                  = null
  currentTenantId:  string | null                  = null
  lastCreatedId:    string | null                  = null

  constructor(options: IWorldOptions) {
    super(options)
    this.app = sharedApp!
  }

  async request(opts: InjectOptions): Promise<LightMyRequestResponse> {
    const res = await this.app.inject(opts)
    this.lastResponse = res
    return res
  }

  async authRequest(opts: InjectOptions): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = {
      ...(opts.headers as Record<string, string> | undefined),
    }
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`
    }
    return this.request({ ...opts, headers })
  }
}

setWorldConstructor(SaasWorld)
