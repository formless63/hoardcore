import { createFileRoute, Link } from '@tanstack/react-router'
import { buttonStyles } from '~/components/ui/button'
import { SourceList } from '~/features/sources/source-list'
import {
  SourceListPending,
  SourceLoadError,
} from '~/features/sources/source-load-state'
import { listCatalogSources } from '~/features/sources/sources.functions'

export const Route = createFileRoute('/sources/')({
  head: () => ({ meta: [{ title: 'Sources · Hoardcore' }] }),
  loader: () => listCatalogSources(),
  pendingComponent: SourceListPending,
  errorComponent: SourceLoadError,
  component: SourcesPage,
})

function SourcesPage() {
  const { sources } = Route.useLoaderData()

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10" id="main-content">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Catalog intake</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            Catalog sources
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
            Register the public catalogs Hoardcore can collect and normalize.
          </p>
        </div>
        <Link to="/sources/new" className={buttonStyles({ className: 'self-start sm:self-auto' })}>
          Add source
        </Link>
      </div>

      <section className="mt-8" aria-label="Registered catalog sources">
        <SourceList sources={sources} />
      </section>
    </main>
  )
}
