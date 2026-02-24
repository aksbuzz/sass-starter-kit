import { useEffect } from 'react'
import { useAuthStore } from '../store/auth.slice'
import { api } from '../api/client'

export function useAuth() {
  const auth = useAuthStore()

  useEffect(() => {
    if (auth.status !== 'idle') return

    auth.setLoading()

    // Token lives only in Zustand (in-memory). On page load, rehydrate via the
    // httpOnly refresh cookie.
    api.refreshToken().then(token => {
      if (token) {
        useAuthStore.getState().setToken(token)
      } else {
        useAuthStore.getState().setUnauthenticated()
      }
    })
  }, [auth.status]) // eslint-disable-line react-hooks/exhaustive-deps

  return auth
}

export function useRequireAuth() {
  return useAuth()
}
