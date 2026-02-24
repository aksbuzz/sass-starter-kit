import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@saas/ui'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            60 * 1000, // 1 min
      retry:                1,
      refetchOnWindowFocus: false,
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  )
}
