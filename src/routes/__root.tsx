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
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header className="border-b border-zinc-800 bg-zinc-950">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link to="/" className="font-semibold tracking-tight text-zinc-100">
              hoardcore
            </Link>
            <span className="text-sm text-zinc-500">inventory creep, organized</span>
          </div>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
