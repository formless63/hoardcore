import type { QueryClient } from '@tanstack/react-query'
import type { RegisteredRouter } from '@tanstack/react-router'

export async function signOutAndNavigate({ signOut, queryClient, router, onSignedOut }: {
  signOut: () => Promise<{ error?: unknown }>
  queryClient: Pick<QueryClient, 'clear'>
  router: Pick<RegisteredRouter, 'navigate' | 'clearCache'>
  onSignedOut: () => void
}) {
  const result = await signOut()
  if (result.error) throw new Error('Sign-out failed')

  queryClient.clear()
  router.clearCache()
  onSignedOut()
  try {
    await router.navigate({ to: '/login', replace: true, ignoreBlocker: true })
  } finally {
    // Leaving the private route can put its loader data into the router cache.
    router.clearCache()
    queryClient.clear()
  }
}
