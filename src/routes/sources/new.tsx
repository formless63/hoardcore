import { createFileRoute, Link } from '@tanstack/react-router'
import { SourceForm } from '~/features/sources/source-form'

export const Route = createFileRoute('/sources/new')({
  head: () => ({ meta: [{ title: 'Add source · Hoardcore' }] }),
  component: NewSourcePage,
})

function NewSourcePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10" id="main-content">
      <div className="max-w-2xl">
        <Link
          to="/sources"
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <BackIcon />
          Catalog sources
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground">Add source</h1>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          Register a Shopify storefront or one collection. This step does not contact the source.
        </p>

        <div className="mt-8">
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
