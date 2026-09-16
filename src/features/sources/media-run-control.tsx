import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { requestMediaCaptureRun } from '~/features/media/media.functions'

type MediaRun = { id: string; status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed'; requestLimit: number; requestCount: number; capturedCount: number; error: string | null }

export function MediaRunControl({ sourceId, enabled, run }: { sourceId: string; enabled: boolean; run?: MediaRun }) {
  const queue = useServerFn(requestMediaCaptureRun)
  const router = useRouter()
  const [limit, setLimit] = useState(10)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (run?.status !== 'queued' && run?.status !== 'running') return
    const interval = window.setInterval(() => { void router.invalidate() }, 5_000)
    return () => window.clearInterval(interval)
  }, [router, run?.status])
  async function start() {
    setBusy(true); setMessage('')
    try {
      const run = await queue({ data: { sourceId, requestLimit: limit } })
      setMessage(`Photo batch queued (${run.id.slice(0, 8)}). Up to ${limit} total HTTP requests, including robots checks; uncaptured images remain for another batch.`)
      await router.invalidate({ sync: true })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not queue photo capture')
    } finally { setBusy(false) }
  }
  return <div className="flex max-w-sm flex-wrap items-center justify-end gap-1.5 border-t border-border pt-2 text-xs">
    {run ? <span className="w-full text-right text-muted-foreground">Photo batch {run.status}: {run.capturedCount} saved · {run.requestCount}/{run.requestLimit} requests{run.error ? ` · ${run.error}` : ''}</span> : null}
    <label className="text-muted-foreground">Photo request ceiling <input type="number" min={1} max={100} step={1} value={limit} onChange={(event) => setLimit(Number(event.target.value))} className="ml-1 h-7 w-14 rounded border border-border bg-background px-1" /></label>
    <button type="button" disabled={!enabled || busy || run?.status === 'queued' || run?.status === 'running' || !Number.isInteger(limit) || limit < 1 || limit > 100} onClick={() => void start()} className="h-7 rounded border border-border px-2 text-foreground disabled:opacity-40">{busy ? 'Queueing…' : 'Capture photos'}</button>
    {!enabled ? <span className="w-full text-right text-muted-foreground">Off on this deployment. Enable only on an approved collection host.</span> : null}
    {message ? <span role="status" className="w-full text-right text-muted-foreground">{message}</span> : null}
  </div>
}
