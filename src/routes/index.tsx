import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { buttonStyles } from '~/components/ui/button'
import { SourceList } from '~/features/sources/source-list'
import {
  SourceListPending,
  SourceLoadError,
} from '~/features/sources/source-load-state'
import { listCatalogSources, listCollectionRuns } from '~/features/sources/sources.functions'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getOperatorSettings } from '~/features/settings/settings.functions'

export const Route = createFileRoute('/')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: async () => {
    const [{ sources }, { runs }, settings] = await Promise.all([
      listCatalogSources(),
      listCollectionRuns({ data: {} }),
      getOperatorSettings(),
    ])
    const latestRuns = Object.fromEntries(
      sources.map((source) => [source.id, runs.find((run) => run.sourceId === source.id)]),
    )
    return { sources, latestRuns, settings }
  },
  pendingComponent: SourceListPending,
  errorComponent: SourceLoadError,
  component: Overview,
})

function Overview() {
  const { sources, latestRuns, settings } = Route.useLoaderData()
  const awaitingCollection = sources.filter((source) => source.status === 'not_collected').length
  const needsAttention = sources.filter((source) => source.status === 'error').length
  const recentSources = sources.slice(0, 3)

  return (
    <main className="w-full px-2 py-3 sm:px-3" id="main-content">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-foreground">Overview</h1>
        <Link to="/sources/new" className={buttonStyles({ className: 'self-start' })}>
          <PlusIcon />
          Add source
        </Link>
      </div>

      <section aria-label="Source summary" className="mt-3 grid gap-2 sm:grid-cols-3">
        <Metric label="Catalog sources" value={sources.length} />
        <Metric label="Awaiting first collection" value={awaitingCollection} />
        <Metric label="Needs attention" value={needsAttention} />
      </section>

      <section className="mt-4" aria-labelledby="recent-sources-heading">
        <div className="mb-2 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground" id="recent-sources-heading">
              Recent sources
            </h2>
          </div>
          {sources.length > 3 ? (
            <Link
              to="/sources"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              View all
            </Link>
          ) : null}
        </div>
        <SourceList sources={recentSources} latestRuns={latestRuns} defaultRequestLimit={settings.defaultCollectionRequestLimit} />
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-xl font-medium tracking-tight text-card-foreground">
        {value}
      </p>
    </article>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
