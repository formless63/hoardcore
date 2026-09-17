/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ActiveThemeProvider } from '~/components/themes/active-theme'
import { ThemeControls } from '~/components/themes/theme-controls'
import { DEFAULT_THEME, THEME_BOOTSTRAP_SCRIPT } from '~/components/themes/theme.config'
import { ThemeProvider } from '~/components/themes/theme-provider'
import appCss from '~/styles/app.css?url'
import { authClient } from '~/lib/auth-client'
import { HoardcoreWordmark } from '~/components/brand/hoardcore-wordmark'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Hoardcore',
      },
      {
        name: 'description',
        content: 'Self-hosted inventory research.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }, { rel: 'icon', type: 'image/png', href: '/favicon.png' }, { rel: 'apple-touch-icon', href: '/favicon.png' }],
  }),
  component: Outlet,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  const session = authClient.useSession()
  const isLoginPage = useRouterState({ select: (state) => state.location.pathname === '/login' })
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>
          <ActiveThemeProvider>
            <a
              className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg transition focus:translate-y-0"
              href="#main-content"
            >
              Skip to content
            </a>
            {!isLoginPage ? <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
              <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 sm:flex-nowrap sm:gap-x-4 sm:px-5 sm:py-2">
                <div className="flex min-w-0 items-center">
                  <Link
                    to="/"
                    aria-label="Hoardcore overview"
                    className="shrink-0 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HoardcoreWordmark />
                  </Link>
                </div>
                <nav
                  aria-label="Primary navigation"
                  className="order-3 flex w-full gap-1 overflow-x-auto pb-0.5 sm:order-none sm:w-auto sm:flex-1 sm:pb-0"
                >
                  <Link
                    to="/"
                    activeOptions={{ exact: true }}
                    className="shrink-0 rounded-sm border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/40 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground"
                  >
                    Overview
                  </Link>
                  <Link
                    to="/sources"
                    className="shrink-0 rounded-sm border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/40 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground"
                  >
                    Sources
                  </Link>
                  <Link
                    to="/listings"
                    className="shrink-0 rounded-sm border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/40 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground"
                  >
                    Listings
                  </Link>
                  <Link
                    to="/watchlist"
                    className="shrink-0 rounded-sm border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/40 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground"
                  >
                    Watchlist
                  </Link>
                  <Link to="/opportunities" className="shrink-0 rounded-sm border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/40 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground">Opportunities</Link>
                  <Link
                    to="/research/preview"
                    className="shrink-0 rounded-sm border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/40 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground"
                  >
                    Research
                  </Link>
                  <Link to="/settings" className="shrink-0 rounded-sm border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:border-primary/40 [&[data-status=active]]:bg-primary/10 [&[data-status=active]]:text-foreground">Settings</Link>
                </nav>
                <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                  {session.data ? (
                    <button aria-label="Sign out" title="Sign out" className="rounded-sm px-1 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:px-2" onClick={() => void authClient.signOut()} type="button">
                      <span className="sm:hidden">Exit</span><span className="hidden sm:inline">Sign out</span>
                    </button>
                  ) : (
                    <Link className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" to="/login">Sign in</Link>
                  )}
                  <ThemeControls />
                </div>
              </div>
            </header> : null}
            {children}
          </ActiveThemeProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
