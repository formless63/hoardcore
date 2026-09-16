import { Link } from '@tanstack/react-router'
import { Badge } from '~/components/ui/badge'
import { buttonStyles } from '~/components/ui/button'
import { EmptyState } from '~/components/ui/empty-state'
import type { CatalogSourceSummary } from './sources.schemas'
import { SourceStatusBadge } from './source-status-badge'
import { SourceRunControl } from './source-run-control'
import { MediaRunControl } from './media-run-control'
import type { listMediaCaptureRuns } from '~/features/media/media.functions'

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
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {sources.map((source) => (
        <li key={source.id} className="p-4 sm:p-5">
          <article className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-card-foreground">{source.displayName}</h3>
                <Badge>{source.moduleName}</Badge>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{source.summary}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3 sm:justify-end">
              <SourceRunControl sourceId={source.id} run={latestRuns[source.id]} defaultRequestLimit={defaultRequestLimit} />
              <MediaRunControl sourceId={source.id} enabled={mediaCaptureEnabled} run={latestMediaRuns[source.id]} />
              <div className="flex items-center gap-4">
              <SourceStatusBadge status={source.status} />
              <time
                className="text-xs text-muted-foreground"
                dateTime={source.createdAt}
                title="Date registered"
              >
                {createdDateFormatter.format(new Date(source.createdAt))}
              </time>
              </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}
