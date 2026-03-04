import { create } from 'zustand'
import type { AccessTokenPayload } from '../api/types'

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthState {
  status:           AuthStatus
  accessToken:      string | null
  userId:           string | null
  sessionId:        string | null
  tenantId:         string | null
  role:             'owner' | 'admin' | 'member' | null
  isPlatformAdmin:  boolean
  impersonatorId:   string | null
  // actions
  setLoading:         () => void
  setToken:           (token: string) => void
  clearToken:         () => void
  setUnauthenticated: () => void
}

export function decodeToken(token: string): AccessTokenPayload | null {
  try {
    const [, payload] = token.split('.')
    return JSON.parse(atob(payload!.replace(/-/g, '+').replace(/_/g, '/'))) as AccessTokenPayload
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token)
  if (!payload) return true
  return payload.exp * 1000 < Date.now()
}

export function isTokenExpiringSoon(token: string, withinMs = 60_000): boolean {
  const payload = decodeToken(token)
  if (!payload) return true
  return payload.exp * 1000 < Date.now() + withinMs
}

export const useAuthStore = create<AuthState>((set) => ({
  status:          'idle',
  accessToken:     null,
  userId:          null,
  sessionId:       null,
  tenantId:        null,
  role:            null,
  isPlatformAdmin: false,
  impersonatorId:  null,

  setLoading: () => set({ status: 'loading' }),

  setToken: (token) => {
    const payload = decodeToken(token)
    if (!payload || isTokenExpired(token)) {
      set({ status: 'unauthenticated' })
      return
    }
    set({
      status:          'authenticated',
      accessToken:     token,
      userId:          payload.sub,
      sessionId:       payload.sid,
      tenantId:        payload.tid,
      role:            payload.role,
      isPlatformAdmin: payload.ipa ?? false,
      impersonatorId:  payload.imp ?? null,
    })
  },

  clearToken: () => set({
    status:          'unauthenticated',
    accessToken:     null,
    userId:          null,
    sessionId:       null,
    tenantId:        null,
    role:            null,
    isPlatformAdmin: false,
    impersonatorId:  null,
  }),

  setUnauthenticated: () => set({ status: 'unauthenticated' }),
}))
