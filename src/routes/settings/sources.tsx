import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { buttonStyles } from '~/components/ui/button'
import { SourceList } from '~/features/sources/source-list'
import { listCatalogSources } from '~/features/sources/sources.functions'
import { SettingsLoadError, SettingsPending } from '~/features/settings/settings-load-state'

export const Route = createFileRoute('/settings/sources')({
  validateSearch: z.object({ sourceId: z.uuid().optional() }),
  loader: () => listCatalogSources(),
  head: () => ({ meta: [{ title: 'Sources & crawling · Hoardcore' }] }),
  pendingComponent: SettingsPending,
  errorComponent: SettingsLoadError,
  component: SourceSettingsPage,
})

function SourceSettingsPage() {
  const { sources } = Route.useLoaderData()
  const { sourceId } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const selected = sourceId ? sources.filter(source => source.id === sourceId) : sources
  return <main id="main-content" className="w-full space-y-3 px-2 py-3 sm:px-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-base font-semibold">Sources &amp; crawling</h1>
      <div className="flex items-center gap-3 text-xs"><Link to="/sources" className="text-primary underline">Run &amp; monitor</Link><Link to="/sources/new" className={buttonStyles({ size: 'small' })}>Add source</Link></div>
    </div>
    <p className="max-w-3xl text-xs text-muted-foreground">Configure each source in one place: collection schedules, browser/HTTP headers and proxy routing, response handling, cooldown overrides, and catalog options. Changes do not queue a collection.</p>
    <label className="block text-xs font-medium">Source
      <select aria-label="Configure source" className="mt-1 h-9 w-full max-w-md rounded border border-border bg-background px-2 text-foreground" value={sourceId ?? ''} onChange={event => void navigate({ search: { sourceId: event.target.value || undefined } })}>
        <option value="">All sources ({sources.length})</option>
        {sources.map(source => <option key={source.id} value={source.id}>{source.displayName}</option>)}
      </select>
    </label>
    {sourceId && !selected.length ? <p role="status" className="text-sm text-muted-foreground">This source is no longer available. Choose another source above.</p> : <SourceList sources={selected} mode="settings" />}
  </main>
}
