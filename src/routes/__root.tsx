/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ActiveThemeProvider } from '~/components/themes/active-theme'
import { ThemeControls } from '~/components/themes/theme-controls'
import { DEFAULT_THEME, THEME_BOOTSTRAP_SCRIPT } from '~/components/themes/theme.config'
import { ThemeProvider } from '~/components/themes/theme-provider'
import appCss from '~/styles/app.css?url'

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
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: Outlet,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
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
            <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <Link
                    to="/"
                    aria-label="Hoardcore overview"
                    className="font-semibold tracking-tight text-foreground outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    hoardcore
                  </Link>
                </div>
                <nav
                  aria-label="Primary navigation"
                  className="order-3 flex w-full items-center gap-1 sm:order-none sm:w-auto sm:flex-1"
                >
                  <Link
                    to="/"
                    activeOptions={{ exact: true }}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:bg-accent [&[data-status=active]]:text-accent-foreground"
                  >
                    Overview
                  </Link>
                  <Link
                    to="/sources"
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[data-status=active]]:bg-accent [&[data-status=active]]:text-accent-foreground"
                  >
                    Sources
                  </Link>
                </nav>
                <ThemeControls />
              </div>
            </header>
            {children}
          </ActiveThemeProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
