import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { SourceForm } from '~/features/sources/source-form'
import { getPublicSession } from '~/features/auth/auth.functions'

export const Route = createFileRoute('/sources/new')({
  beforeLoad: async ({ location }) => {
    if (!(await getPublicSession())) throw redirect({ to: '/login' })
  },
  head: () => ({ meta: [{ title: 'Add source · Hoardcore' }] }),
  component: NewSourcePage,
})

function NewSourcePage() {
  return (
    <main className="w-full px-2 py-3 sm:px-3" id="main-content">
      <div className="max-w-2xl">
        <Link
          to="/sources"
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <BackIcon />
          Catalog sources
        </Link>
        <h1 className="mt-3 text-base font-semibold text-foreground">Add source</h1>

        <div className="mt-3">
          <SourceForm />
        </div>
      </div>
    </main>
  )
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
