import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { buttonStyles } from '~/components/ui/button'
import { SourceList } from '~/features/sources/source-list'
import {
  SourceListPending,
  SourceLoadError,
} from '~/features/sources/source-load-state'
import { listCatalogSources, listCollectionRuns } from '~/features/sources/sources.functions'
import { getPublicSession } from '~/features/auth/auth.functions'

export const Route = createFileRoute('/')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: async () => {
    const [{ sources }, { runs }] = await Promise.all([
      listCatalogSources(),
      listCollectionRuns({ data: {} }),
    ])
    const latestRuns = Object.fromEntries(
      sources.map((source) => [source.id, runs.find((run) => run.sourceId === source.id)]),
    )
    return { sources, latestRuns }
  },
  pendingComponent: SourceListPending,
  errorComponent: SourceLoadError,
  component: Overview,
})

function Overview() {
  const { sources, latestRuns } = Route.useLoaderData()
  const awaitingCollection = sources.filter((source) => source.status === 'not_collected').length
  const needsAttention = sources.filter((source) => source.status === 'error').length
  const recentSources = sources.slice(0, 3)

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10" id="main-content">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
            Keep catalog sources organized before collection and research begin.
          </p>
        </div>
        <Link to="/sources/new" className={buttonStyles({ className: 'self-start sm:self-auto' })}>
          <PlusIcon />
          Add source
        </Link>
      </div>

      <section aria-label="Source summary" className="mt-8 grid gap-3 sm:grid-cols-3">
        <Metric label="Catalog sources" value={sources.length} />
        <Metric label="Awaiting first collection" value={awaitingCollection} />
        <Metric label="Needs attention" value={needsAttention} />
      </section>

      <section className="mt-10" aria-labelledby="recent-sources-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground" id="recent-sources-heading">
              Recent sources
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Newest registrations appear first.</p>
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
        <SourceList sources={recentSources} latestRuns={latestRuns} />
      </section>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-3xl font-medium tracking-tight text-card-foreground">
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
