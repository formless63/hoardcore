import { useServerFn } from '@tanstack/react-start'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { enqueueCatalogCollection } from './sources.functions'

type CollectionRun = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'not_modified' | 'failed'
  requestCount: string
  error: string | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

const labels: Record<CollectionRun['status'], string> = {
  queued: 'Queued', running: 'Running', succeeded: 'Succeeded', not_modified: 'Not modified', failed: 'Failed',
}

export function SourceRunControl({ sourceId, run }: { sourceId: string; run?: CollectionRun }) {
  const runCollection = useServerFn(enqueueCatalogCollection)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (run?.status !== 'queued' && run?.status !== 'running') return
    const interval = window.setInterval(() => {
      void router.invalidate()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [router, run?.status])

  async function start() {
    if (busy) return
    setBusy(true); setError(null)
    try { await runCollection({ data: { sourceId } }); await router.invalidate({ sync: true }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start collection') }
    finally { setBusy(false) }
  }
  return <div className="flex min-w-48 flex-col items-end gap-2">
    {run ? <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground"><Badge variant={run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'success' : 'info'}>{labels[run.status]}</Badge><span>{run.requestCount} request{run.requestCount === '1' ? '' : 's'}</span><time dateTime={run.completedAt?.toISOString() ?? run.createdAt.toISOString()}>{(run.completedAt ?? run.createdAt).toLocaleString()}</time></div> : <span className="text-xs text-muted-foreground">No collection runs</span>}
    <Button disabled={busy || run?.status === 'queued' || run?.status === 'running'} size="small" variant="secondary" onClick={() => void start()}>{busy ? 'Starting…' : 'Run collection'}</Button>
    {run?.status === 'failed' && run.error ? <p className="max-w-xs text-right text-xs text-destructive" role="alert">{run.error}</p> : null}
    {error ? <p className="max-w-xs text-right text-xs text-destructive" role="alert">{error}</p> : null}
  </div>
}
