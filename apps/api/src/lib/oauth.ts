// OAuth 2.0 helpers for Google and GitHub.

import { config } from '../config.js'


export interface OAuthProfile {
  providerUserId: string
  email:          string
  emailVerified:  boolean
  name:           string | null
  avatarUrl:      string | null
  rawProfile:     Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

interface GoogleTokens {
  access_token:  string
  refresh_token: string | undefined
  expires_in:    number    // seconds
  token_type:    string
  id_token:      string
}

interface GoogleUserInfo {
  id:             string
  email:          string
  verified_email: boolean
  name:           string
  picture:        string
}

export const google = {
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id:     config.GOOGLE_CLIENT_ID,
      redirect_uri:  `${config.API_URL}/auth/google/callback`,
      response_type: 'code',
      scope:         'openid email profile',
      state,
      access_type:   'offline',   // request refresh token
      prompt:        'consent',   // always show consent to get refresh token
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  },

  async exchangeCode(code: string): Promise<{ tokens: GoogleTokens; expiresAt: Date }> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${config.API_URL}/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Google token exchange failed (${res.status}): ${body}`)
    }
    const tokens = await res.json() as GoogleTokens
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1_000)
    return { tokens, expiresAt }
  },

  async getProfile(accessToken: string): Promise<OAuthProfile> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Google profile fetch failed (${res.status})`)
    const raw = await res.json() as GoogleUserInfo
    return {
      providerUserId: raw.id,
      email:          raw.email,
      emailVerified:  raw.verified_email,
      name:           raw.name ?? null,
      avatarUrl:      raw.picture ?? null,
      rawProfile:     raw as unknown as Record<string, unknown>,
    }
  },
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

interface GitHubTokens {
  access_token: string
  token_type:   string
  scope:        string
}

interface GitHubUser {
  id:         number
  login:      string
  name:       string | null
  avatar_url: string
  email:      string | null
}

interface GitHubEmail {
  email:    string
  primary:  boolean
  verified: boolean
}

export const github = {
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id:    config.GITHUB_CLIENT_ID,
      redirect_uri: `${config.API_URL}/auth/github/callback`,
      scope:        'read:user user:email',
      state,
    })
    return `https://github.com/login/oauth/authorize?${params}`
  },

  async exchangeCode(code: string): Promise<GitHubTokens> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        client_id:     config.GITHUB_CLIENT_ID,
        client_secret: config.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  `${config.API_URL}/auth/github/callback`,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`GitHub token exchange failed (${res.status}): ${body}`)
    }
    return res.json() as Promise<GitHubTokens>
  },

  async getProfile(accessToken: string): Promise<OAuthProfile> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept:        'application/vnd.github+json',
    }

    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user',         { headers }),
      fetch('https://api.github.com/user/emails',  { headers }),
    ])
    if (!userRes.ok)   throw new Error(`GitHub user fetch failed (${userRes.status})`)
    if (!emailsRes.ok) throw new Error(`GitHub email fetch failed (${emailsRes.status})`)

    const raw    = await userRes.json() as GitHubUser
    const emails = await emailsRes.json() as GitHubEmail[]

    // Prefer the primary verified email
    const primaryEmail = emails.find(e => e.primary && e.verified)
      ?? emails.find(e => e.verified)

    const email     = primaryEmail?.email ?? raw.email ?? ''
    const verified  = primaryEmail?.verified ?? false

    return {
      providerUserId: String(raw.id),
      email,
      emailVerified:  verified,
      name:           raw.name ?? raw.login,
      avatarUrl:      raw.avatar_url ?? null,
      rawProfile:     raw as unknown as Record<string, unknown>,
    }
  },
}
