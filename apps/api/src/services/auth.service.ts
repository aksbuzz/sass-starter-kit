import { injectable, inject }   from 'inversify'
import { randomBytes }          from 'node:crypto'
import {
  withAdmin,
  CacheRepository,
  type SessionData,
} from '@saas/db'
import type pino                from 'pino'
import { TOKENS }               from '../container/tokens.js'
import { encrypt }              from '../lib/crypto.js'
import { google, github }       from '../lib/oauth.js'
import type { OAuthProfile }    from '../lib/oauth.js'
import { config }               from '../config.js'
import { buildPermissions }     from '../lib/permissions.js'

export type OAuthProvider = 'google' | 'github'

export interface OAuthCallbackResult {
  userId:    string
  sessionId: string
  tenantId:  string | null
  planId:    string | null
  planSlug:  string | null
  role:      string | null
  /** Present only when this session is an impersonation */
  impersonatorId?: string
}


@injectable()
export class AuthService {
  constructor(
    @inject(TOKENS.CacheRepository) private readonly cache: CacheRepository,
    @inject(TOKENS.Logger)          private readonly logger: pino.Logger,
  ) {}


  async initiateOAuth(provider: OAuthProvider): Promise<string> {
    const state = randomBytes(16).toString('hex')
    await this.cache.set(
      `oauth:state:${state}`,
      { provider },
      { ttlSeconds: 300, tags: ['oauth:state'] },
    )
    return provider === 'google'
      ? google.getAuthUrl(state)
      : github.getAuthUrl(state)
  }

  async handleOAuthCallback(
    provider:   OAuthProvider,
    code:       string,
    state:      string,
    meta:       { ipAddress: string | null; userAgent: string | null },
  ): Promise<OAuthCallbackResult> {
    // 1. Validate CSRF state — atomically delete and return in one SQL op to prevent replay attacks
    const cached = await this.cache.getAndDelete<{ provider: OAuthProvider }>(`oauth:state:${state}`)
    if (!cached || cached.provider !== provider) {
      throw Object.assign(new Error('Invalid OAuth state — possible CSRF attempt'), { statusCode: 400 })
    }

    // 2. Exchange authorization code for tokens + fetch user profile
    const { profile, accessTokenEnc, refreshTokenEnc, tokenExpiresAt } =
      await this.fetchProviderData(provider, code)

    this.logger.info({ provider, email: profile.email }, 'OAuth callback received')

    // 3. Upsert user, link OAuth account, create session — all in one admin transaction
    return withAdmin(async ({ repos }) => {
      // Upsert user: create on first login, update name/avatar on subsequent logins
      const user = await repos.users.upsertByEmail({
        email:         profile.email,
        emailVerified: profile.emailVerified,
        name:          profile.name,
        avatarUrl:     profile.avatarUrl,
      })

      // Link OAuth provider account (stores encrypted tokens for API access if needed)
      await repos.oauthAccounts.upsert({
        userId:           user.id,
        provider,
        providerUserId:   profile.providerUserId,
        providerEmail:    profile.email,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt,
        rawProfile:       profile.rawProfile,
      })

      // Determine default tenantId: the user's first active membership, if any.
      // On first login the user has no memberships, so tenantId is null.
      // They'll be prompted to create or accept an invitation on the frontend.
      const userTenants = await repos.memberships.findTenantsForUser(user.id)
      const defaultTenantId = userTenants[0]?.tenantId ?? null

      let planId: string | null = null
      let planSlug: string | null = null
      let role = null

      if (defaultTenantId) {
        const sub = await repos.subscriptions.findByTenantId(defaultTenantId)
        planId   = sub?.planId   ?? null
        planSlug = sub?.plan?.slug ?? null
        role     = userTenants[0]?.role ?? null
      }

      const effectiveRole = role ?? 'member'
      const sessionData: SessionData = {
        role:        effectiveRole,
        planId:      planId ?? '',
        planSlug:    planSlug ?? '',
        permissions: buildPermissions(effectiveRole),
      }

      const session = await repos.sessions.create({
        userId:    user.id,
        tenantId:  defaultTenantId,
        data:      sessionData,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
      })

      this.logger.info({ userId: user.id, sessionId: session.id }, 'Session created')

      return {
        userId:    user.id,
        sessionId: session.id,
        tenantId:  defaultTenantId,
        planId,
        planSlug,
        role,
      }
    })
  }


  async rotateSession(
    oldSessionId: string,
    userId:       string,
    meta:         { ipAddress: string | null; userAgent: string | null },
  ): Promise<OAuthCallbackResult> {
    return withAdmin(async ({ repos }) => {
      // Lock the session row to prevent concurrent refresh from the same token
      const oldSession = await repos.sessions.findValidForUpdate(oldSessionId)
      if (!oldSession) {
        throw Object.assign(new Error('Session not found or expired'), { statusCode: 401 })
      }

      // Verify the session belongs to the user making the refresh request
      if (oldSession.userId !== userId) {
        throw Object.assign(new Error('Session does not belong to this user'), { statusCode: 401 })
      }

      // Delete old session (rotation: one refresh per session)
      await repos.sessions.deleteById(oldSessionId)

      const data = oldSession.data as SessionData & { planId?: string; planSlug?: string }

      // Cap TTL: impersonation sessions get 2 hours max, normal sessions get 7 days
      const isImpersonation = !!data.impersonatorId
      const maxTtlMs = isImpersonation ? 2 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000

      // Create a new session with the same context
      const newSession = await repos.sessions.create({
        userId,
        tenantId:  oldSession.tenantId,
        data:      oldSession.data,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + maxTtlMs),
      })

      return {
        userId,
        sessionId: newSession.id,
        tenantId:  newSession.tenantId,
        planId:    data.planId   ?? null,
        planSlug:  data.planSlug ?? null,
        role:      data.role     ?? null,
        impersonatorId: data.impersonatorId ?? undefined,
      }
    })
  }


  // Creates a short-lived (30s) one-time auth code that the frontend exchanges for a JWT.
  // This avoids placing the access token in the URL fragment where it could leak via
  // browser history, Referer headers, or browser extensions.
  async createAuthCode(result: OAuthCallbackResult): Promise<string> {
    const code = randomBytes(32).toString('hex')
    await this.cache.set(
      `auth:code:${code}`,
      result,
      { ttlSeconds: 30 },
    )
    return code
  }

  async exchangeAuthCode(code: string): Promise<OAuthCallbackResult | null> {
    return this.cache.getAndDelete<OAuthCallbackResult>(`auth:code:${code}`)
  }

  async logout(sessionId: string): Promise<void> {
    await withAdmin(async ({ repos }) => {
      await repos.sessions.deleteById(sessionId)
    })
  }


  private async fetchProviderData(provider: OAuthProvider, code: string): Promise<{
    profile:         OAuthProfile
    accessTokenEnc:  string | null
    refreshTokenEnc: string | null
    tokenExpiresAt:  Date | null
  }> {
    if (provider === 'google') {
      const { tokens, expiresAt } = await google.exchangeCode(code)
      const profile = await google.getProfile(tokens.access_token)
      return {
        profile,
        accessTokenEnc:  encrypt(tokens.access_token,  config.ENCRYPTION_KEY),
        refreshTokenEnc: tokens.refresh_token
          ? encrypt(tokens.refresh_token, config.ENCRYPTION_KEY)
          : null,
        tokenExpiresAt: expiresAt,
      }
    }

    const tokens  = await github.exchangeCode(code)
    const profile = await github.getProfile(tokens.access_token)
    return {
      profile,
      accessTokenEnc:  encrypt(tokens.access_token, config.ENCRYPTION_KEY),
      refreshTokenEnc: null,   // GitHub tokens don't expire
      tokenExpiresAt:  null,
    }
  }
}

