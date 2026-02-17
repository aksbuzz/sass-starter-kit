import type { Sql } from 'postgres'
import type { OAuthAccount, NewOAuthAccount, OAuthProvider } from '../types.js'

export class OAuthAccountsRepository {
  constructor(private readonly sql: Sql) {}

  async findByProvider(provider: OAuthProvider, providerUserId: string): Promise<OAuthAccount | null> {
    const rows = await this.sql<OAuthAccount[]>`
      SELECT * FROM oauth_accounts
      WHERE  provider = ${provider} AND provider_user_id = ${providerUserId}
    `
    return rows[0] ?? null
  }

  async findByUserId(userId: string): Promise<OAuthAccount[]> {
    return this.sql<OAuthAccount[]>`
      SELECT * FROM oauth_accounts WHERE user_id = ${userId}
    `
  }

  async upsert(data: NewOAuthAccount): Promise<OAuthAccount> {
    const rows = await this.sql<OAuthAccount[]>`
      INSERT INTO oauth_accounts (
        user_id, provider, provider_user_id, provider_email,
        access_token_enc, refresh_token_enc, token_expires_at, raw_profile
      ) VALUES (
        ${data.userId},
        ${data.provider},
        ${data.providerUserId},
        ${data.providerEmail ?? null},
        ${data.accessTokenEnc ?? null},
        ${data.refreshTokenEnc ?? null},
        ${data.tokenExpiresAt ?? null},
        ${this.sql.json(data.rawProfile as unknown as Parameters<(typeof this.sql)['json']>[0])}
      )
      ON CONFLICT (provider, provider_user_id) DO UPDATE
        SET provider_email    = COALESCE(EXCLUDED.provider_email, oauth_accounts.provider_email),
            access_token_enc  = COALESCE(EXCLUDED.access_token_enc, oauth_accounts.access_token_enc),
            refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, oauth_accounts.refresh_token_enc),
            token_expires_at  = COALESCE(EXCLUDED.token_expires_at, oauth_accounts.token_expires_at),
            raw_profile       = EXCLUDED.raw_profile,
            updated_at        = NOW()
      RETURNING *
    `
    return rows[0]!
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM oauth_accounts WHERE id = ${id}`
  }
}
