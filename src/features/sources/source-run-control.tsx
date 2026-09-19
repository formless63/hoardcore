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
  const [interPageWaitMinutes, setInterPageWaitMinutes] = useState(1)

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
      const next = await runCollection({ data: { sourceId, requestLimit, interPageWaitMs: interPageWaitMinutes * 60_000 } })
      if (watch) await navigate({ to: '/runs/$runId', params: { runId: next.id } })
      else await router.invalidate({ sync: true })
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start collection') }
    finally { setBusy(false) }
  }
  return <div className="grid gap-2 text-xs xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:items-end">
    <div className="flex flex-wrap items-center gap-2 self-center text-muted-foreground">{run ? <><Badge variant={run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'success' : 'info'}>{labels[run.status]}</Badge><span>{run.requestCount}/{run.requestLimit} requests</span><span>{run.pageCount} pages · {run.productCount} products</span><time dateTime={run.completedAt?.toISOString() ?? run.createdAt.toISOString()}>{(run.completedAt ?? run.createdAt).toLocaleString()}</time><Link className="text-primary underline-offset-2 hover:underline" to="/runs/$runId" params={{ runId: run.id }}>Log</Link></> : <span>No collection runs</span>}</div>
    <label className="text-muted-foreground">Request ceiling <Input className="ml-1 h-8 w-16" type="number" min={2} max={20} step={1} value={requestLimit} onChange={(event) => setRequestLimit(Number(event.target.value))} /></label>
    <label className="text-muted-foreground">Page wait <Input aria-label="Wait between full pages in minutes" className="ml-1 h-8 w-14" type="number" min={0} max={5} step={1} value={interPageWaitMinutes} onChange={(event) => setInterPageWaitMinutes(Number(event.target.value))} /> min</label>
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button disabled={disabled || busy || requestLimit < 2 || requestLimit > 20 || !Number.isInteger(requestLimit) || !Number.isInteger(interPageWaitMinutes) || interPageWaitMinutes < 0 || interPageWaitMinutes > 5 || run?.status === 'queued' || run?.status === 'running'} size="small" variant="secondary" onClick={() => void start(false)}>{busy ? 'Starting…' : 'Run in background'}</Button>
      <Button disabled={disabled || busy || requestLimit < 2 || requestLimit > 20 || !Number.isInteger(requestLimit) || !Number.isInteger(interPageWaitMinutes) || interPageWaitMinutes < 0 || interPageWaitMinutes > 5 || run?.status === 'queued' || run?.status === 'running'} size="small" onClick={() => void start(true)}>Run &amp; watch</Button>
    </div>
    <details className="text-muted-foreground xl:col-span-4"><summary className="cursor-pointer">Collection safety limits</summary><p className="mt-1 max-w-3xl">The ceiling includes the access-policy check. The optional 0–5 minute page wait never replaces minimum pacing or source Retry-After.</p></details>
    {(run?.status === 'failed' || run?.status === 'partial') && run.error ? <p className="text-destructive xl:col-span-4" role="alert">{run.error}</p> : null}
    {error ? <p className="text-destructive xl:col-span-4" role="alert">{error}</p> : null}
  </div>
}
