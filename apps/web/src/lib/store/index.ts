// Re-export the Zustand auth store as the single store entry point.
// Consumers that previously imported { store }, RootState, AppDispatch, or
// useAppDispatch/useAppSelector should now import useAuthStore directly from
// '@/lib/store/auth.slice' or from here.
export { useAuthStore } from './auth.slice'
export type { AuthState, AuthStatus } from './auth.slice'
