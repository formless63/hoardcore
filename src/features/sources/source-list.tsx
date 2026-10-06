import { Link, useRouter } from '@tanstack/react-router'
import { Badge } from '~/components/ui/badge'
import { buttonStyles } from '~/components/ui/button'
import { EmptyState } from '~/components/ui/empty-state'
import type { CatalogSourceSummary } from './sources.schemas'
import { SourceStatusBadge } from './source-status-badge'
import { SourceRunControl } from './source-run-control'
import { MediaRunControl } from './media-run-control'
import { SourceScheduleControl } from './source-schedule-control'
import type { listMediaCaptureRuns } from '~/features/media/media.functions'
import { SourceCatalogOptionsControl } from './source-catalog-options-control'
import { formatScheduledDate } from './source-schedule'
import { SourceSafetyControl, useSourceSafety } from './source-safety-control'
import { SourceRoutingControl } from './source-routing-control'

const createdDateFormatter = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
})

export function SourceList({
  sources,
  emptyDescription = 'Register a catalog source to start building a durable inventory history.',
  latestRuns = {},
  defaultRequestLimit = 3,
  mediaCaptureEnabled = false,
  latestMediaRuns = {},
}: {
  sources: CatalogSourceSummary[]
  emptyDescription?: string
  latestRuns?: Record<string, Parameters<typeof SourceRunControl>[0]['run']>
  defaultRequestLimit?: number
  mediaCaptureEnabled?: boolean
  latestMediaRuns?: Record<string, Awaited<ReturnType<typeof listMediaCaptureRuns>>[number] | undefined>
}) {
  const router = useRouter()
  if (sources.length === 0) {
    return (
      <EmptyState
        title="No catalog sources yet"
        description={emptyDescription}
        action={
          <Link to="/sources/new" className={buttonStyles()}>
            Add source
          </Link>
        }
      />
    )
  }

  return (
    <ul className="space-y-2">
      {sources.map((source) => (
        <li key={source.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <article className="grid gap-3 lg:grid-cols-[minmax(13rem,.6fr)_minmax(0,1.8fr)]">
            <div className="flex min-w-0 flex-col justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-card-foreground">{source.displayName}</h3>
                <Badge>{source.moduleName}</Badge>
                <SourceStatusBadge status={source.status} />
              </div><p className="mt-1 truncate text-sm text-muted-foreground" title={source.summary}>{source.summary}</p></div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>Added {createdDateFormatter.format(new Date(source.createdAt))}</span>{source.currency ? <span>{source.currency}</span> : null}{source.stockCardsEnabled ? <span>Stock supplement on</span> : null}</div>
              {source.moduleId === 'shopify' ? <SourceCatalogOptionsControl source={source} onSaved={() => { void router.invalidate({ sync: true }) }} /> : null}
            </div>
            <SourceControls source={source} run={latestRuns[source.id]} mediaRun={latestMediaRuns[source.id]} defaultRequestLimit={defaultRequestLimit} mediaCaptureEnabled={mediaCaptureEnabled} />
          </article>
        </li>
      ))}
    </ul>
  )
}

function SourceControls({ source, run, mediaRun, defaultRequestLimit, mediaCaptureEnabled }: {
  source: CatalogSourceSummary
  run: Parameters<typeof SourceRunControl>[0]['run']
  mediaRun: Parameters<typeof MediaRunControl>[0]['run']
  defaultRequestLimit: number
  mediaCaptureEnabled: boolean
}) {
  const query = useSourceSafety(source.id)
  const state = query.data?.state
  const blocked = !source.collectionEnabled || !query.data?.collectionEnabled || Boolean(state?.paused || state?.blockedUntil && state.blockedUntil > new Date())
  const scanInterval = Boolean(state?.lastScanAt && query.data && state.lastScanAt.getTime() + query.data.policy.minimumScanHours * 3_600_000 > Date.now())
  return <div className="min-w-0 space-y-2">
    <SourceSafetyControl sourceId={source.id} query={query} />
    <SourceRoutingControl sourceId={source.id} />
    <section className="rounded border border-border/70 p-2" aria-label={`Collection controls for ${source.displayName}`}>
      <SourceRunControl sourceId={source.id} run={run} defaultRequestLimit={defaultRequestLimit} disabled={blocked || scanInterval} />
    </section>
    <details className="rounded border border-border/70 p-2"><summary className="cursor-pointer text-xs font-medium">Schedule{source.nextRunAt ? ` · next ${formatScheduledDate(source.nextRunAt, source.scheduleTimezone)}` : ' · manual only'}</summary><div className="mt-2"><SourceScheduleControl source={source} /></div></details>
    <details className="rounded border border-border/70 p-2"><summary className="cursor-pointer text-xs font-medium">Photo capture</summary><div className="mt-2"><MediaRunControl sourceId={source.id} enabled={mediaCaptureEnabled} disabled={blocked} run={mediaRun} /></div></details>
  </div>
}
