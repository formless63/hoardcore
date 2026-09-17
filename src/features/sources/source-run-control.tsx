import { useServerFn } from '@tanstack/react-start'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { enqueueCatalogCollection } from './sources.functions'

type CollectionRun = {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'not_modified' | 'failed'
  requestLimit: number
  requestCount: string
  pageCount: number
  productCount: number
  error: string | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
}

const labels: Record<CollectionRun['status'], string> = {
  queued: 'Queued', running: 'Running', succeeded: 'Succeeded', partial: 'Partial', not_modified: 'Not modified', failed: 'Failed',
}

export function SourceRunControl({ sourceId, run, defaultRequestLimit = 3, disabled = false }: { sourceId: string; run?: CollectionRun; defaultRequestLimit?: number; disabled?: boolean }) {
  const runCollection = useServerFn(enqueueCatalogCollection)
  const router = useRouter()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestLimit, setRequestLimit] = useState(defaultRequestLimit)

  useEffect(() => {
    if (run?.status !== 'queued' && run?.status !== 'running') return
    const interval = window.setInterval(() => {
      void router.invalidate()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [router, run?.status])

  async function start(watch: boolean) {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const next = await runCollection({ data: { sourceId, requestLimit } })
      if (watch) await navigate({ to: '/runs/$runId', params: { runId: next.id } })
      else await router.invalidate({ sync: true })
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start collection') }
    finally { setBusy(false) }
  }
  return <div className="flex min-w-48 flex-col items-end gap-2">
    {run ? <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground"><Badge variant={run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'success' : 'info'}>{labels[run.status]}</Badge><span>{run.requestCount}/{run.requestLimit} requests</span><span>{run.pageCount} pages · {run.productCount} products</span><time dateTime={run.completedAt?.toISOString() ?? run.createdAt.toISOString()}>{(run.completedAt ?? run.createdAt).toLocaleString()}</time></div> : <span className="text-xs text-muted-foreground">No collection runs</span>}
    {run ? <Link className="text-xs text-primary underline-offset-2 hover:underline" to="/runs/$runId" params={{ runId: run.id }}>View run log</Link> : null}
    <label className="flex items-center gap-2 text-xs text-muted-foreground">Request ceiling
      <Input className="h-8 w-20" type="number" min={2} max={20} step={1} value={requestLimit} onChange={(event) => setRequestLimit(Number(event.target.value))} />
    </label>
    <p className="max-w-60 text-right text-xs text-muted-foreground">Includes the access-policy check. Requests are spaced at least one second apart. Incomplete collections are saved as partial.</p>
    <div className="flex flex-wrap justify-end gap-2">
      <Button disabled={disabled || busy || requestLimit < 2 || requestLimit > 20 || !Number.isInteger(requestLimit) || run?.status === 'queued' || run?.status === 'running'} size="small" variant="secondary" onClick={() => void start(false)}>{busy ? 'Starting…' : 'Run in background'}</Button>
      <Button disabled={disabled || busy || requestLimit < 2 || requestLimit > 20 || !Number.isInteger(requestLimit) || run?.status === 'queued' || run?.status === 'running'} size="small" onClick={() => void start(true)}>Run &amp; watch</Button>
    </div>
    {(run?.status === 'failed' || run?.status === 'partial') && run.error ? <p className="max-w-xs text-right text-xs text-destructive" role="alert">{run.error}</p> : null}
    {error ? <p className="max-w-xs text-right text-xs text-destructive" role="alert">{error}</p> : null}
  </div>
}
