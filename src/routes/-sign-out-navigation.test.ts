import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { signOutAndNavigate } from './-sign-out-navigation'

describe('sign-out navigation', () => {
  it('removes query, mutation, and private loader caches and replaces the private route with login', async () => {
    let authenticated = true
    const queryClient = new QueryClient()
    queryClient.setQueryData(['private'], { title: 'Private listing' })
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['private-save'] })
    const root = createRootRoute()
    const privateRoute = createRoute({
      getParentRoute: () => root,
      path: '/listings',
      beforeLoad: () => { if (!authenticated) throw redirect({ to: '/login' }) },
      loader: () => ({ title: 'Private listing' }),
    })
    const loginRoute = createRoute({ getParentRoute: () => root, path: '/login' })
    const history = createMemoryHistory({ initialEntries: ['/listings'] })
    const router = createRouter({ routeTree: root.addChildren([privateRoute, loginRoute]), history, isServer: false, origin: 'http://localhost' })
    await router.load()
    expect(router.state.matches.find((match) => match.pathname === '/listings')?.loaderData).toEqual({ title: 'Private listing' })

    const onSignedOut = vi.fn(() => {
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    })
    const navigate = vi.fn(async () => { await router.navigate({ to: '/login', replace: true, ignoreBlocker: true }) })
    const retiredRouteIds: string[] = []
    await signOutAndNavigate({
      signOut: async () => { authenticated = false; return { error: null } },
      queryClient,
      router: { navigate, clearCache: () => router.clearCache({ filter: (match) => { retiredRouteIds.push(match.routeId); return true } }) },
      onSignedOut,
    })

    expect(onSignedOut).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith({ to: '/login', replace: true, ignoreBlocker: true })
    expect(history.location.pathname).toBe('/login')
    expect(history.length).toBe(1)
    expect(router.state.matches.some((match) => match.pathname === '/listings')).toBe(false)
    expect(retiredRouteIds).toContain('/listings')
    await router.navigate({ to: '/listings' })
    expect(history.location.pathname).toBe('/login')
  })

  it.each(['returned', 'thrown'])('retains the private view and caches on %s auth failure', async (failure) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['private'], 'Private listing')
    const router = { navigate: vi.fn(), clearCache: vi.fn() }
    const onSignedOut = vi.fn()
    const signOut = async () => {
      if (failure === 'thrown') throw new Error('Network failure')
      return { error: { message: 'Sign-out rejected' } }
    }

    await expect(signOutAndNavigate({ signOut, queryClient, router, onSignedOut })).rejects.toThrow()
    expect(queryClient.getQueryData(['private'])).toBe('Private listing')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.clearCache).not.toHaveBeenCalled()
    expect(onSignedOut).not.toHaveBeenCalled()
  })

  it('keeps private caches cleared when login navigation fails after successful sign-out', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['private'], 'Private listing')
    const onSignedOut = vi.fn()
    const router = {
      clearCache: vi.fn(),
      navigate: vi.fn(async () => {
        queryClient.setQueryData(['late-private'], 'Late response')
        throw new Error('Navigation failed')
      }),
    }
    await expect(signOutAndNavigate({ signOut: async () => ({ error: null }), queryClient, router, onSignedOut })).rejects.toThrow('Navigation failed')
    expect(onSignedOut).toHaveBeenCalledOnce()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
    expect(router.clearCache).toHaveBeenCalledTimes(2)
  })
})
