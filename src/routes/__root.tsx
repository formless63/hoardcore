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
            <header className="border-b border-border bg-card/80 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
                <div className="flex min-w-0 items-baseline gap-3">
                  <Link to="/" className="font-semibold tracking-tight text-foreground">
                    hoardcore
                  </Link>
                  <span className="hidden truncate text-sm text-muted-foreground sm:inline">
                    inventory creep, organized
                  </span>
                </div>
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
