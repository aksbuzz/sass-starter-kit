import { API_PATHS } from '@saas/config'
import { clientEnv } from '@saas/config/client'
import { useAuthStore, isTokenExpiringSoon } from '../store/auth.slice'

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function baseUrlForPath(path: string): string {
  return path.startsWith('/admin') ? clientEnv.ADMIN_API_URL : clientEnv.API_URL
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  _retry = true,
): Promise<T> {
  const state = useAuthStore.getState()
  let token   = state.accessToken

  if (token && isTokenExpiringSoon(token)) {
    token = await refreshToken()
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  let res: Response
  try {
    res = await fetch(`${baseUrlForPath(path)}${path}`, {
      ...options,
      credentials: 'include',
      headers,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(408, 'TIMEOUT', 'Request timed out')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status === 401 && _retry) {
    const newToken = await refreshToken()
    if (newToken) return apiFetch<T>(path, options, false)
    useAuthStore.getState().clearToken()
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired — please sign in again')
  }

  if (!res.ok) {
    let body: { message?: string; error?: string; code?: string } = {}
    try { body = await res.json() } catch { /* ignore */ }
    throw new ApiError(res.status, body.code ?? body.error ?? 'API_ERROR', body.message ?? 'An unexpected error occurred')
  }

  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}


let refreshPromise: Promise<string | null> | null = null

async function refreshToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${clientEnv.API_URL}${API_PATHS.auth.refresh}`, {
        method:      'POST',
        credentials: 'include',
      })
      if (!res.ok) return null
      const data = await res.json() as { accessToken: string }
      useAuthStore.getState().setToken(data.accessToken)
      return data.accessToken
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export const api = {
  get:    <T>(path: string, opts?: RequestInit)                 => apiFetch<T>(path, { ...opts, method: 'GET' }),
  post:   <T>(path: string, body?: unknown, opts?: RequestInit) => apiFetch<T>(path, { ...opts, method: 'POST',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body?: unknown, opts?: RequestInit) => apiFetch<T>(path, { ...opts, method: 'PUT',   body: JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown, opts?: RequestInit) => apiFetch<T>(path, { ...opts, method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, opts?: RequestInit)                 => apiFetch<T>(path, { ...opts, method: 'DELETE' }),
  refreshToken,
}
