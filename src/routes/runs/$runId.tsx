import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { getPublicSession } from '~/features/auth/auth.functions'
import { continueDeferredCollection, getCollectionRun } from '~/features/sources/sources.functions'
import { Badge } from '~/components/ui/badge'
import { buttonStyles } from '~/components/ui/button'

export const Route = createFileRoute('/runs/$runId')({
  beforeLoad: async () => {
    if (!(await getPublicSession())) throw redirect({ to: '/login' })
  },
  loader: ({ params }) => getCollectionRun({ data: { runId: params.runId } }),
  head: () => ({ meta: [{ title: 'Collection run · Hoardcore' }] }),
  component: CollectionRunPage,
})

function CollectionRunPage() {
  const { run, sourceName, events } = Route.useLoaderData()
  const router = useRouter()
  const active = run.status === 'queued' || run.status === 'running'
  const continueRun = useServerFn(continueDeferredCollection)
  const [continueError, setContinueError] = useState<string | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (run.status !== 'queued' || !run.nextAllowedAt) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [run.status, run.nextAllowedAt])
  const hardGate = Math.max(run.minimumAllowedAt?.getTime() ?? 0, run.retryAfterUntil?.getTime() ?? 0, now)
  const canContinue = run.status === 'queued' && !!run.nextAllowedAt && run.nextAllowedAt.getTime() > hardGate
  const remainingSeconds = run.nextAllowedAt ? Math.max(0, Math.ceil((run.nextAllowedAt.getTime() - now) / 1000)) : 0

  async function requestContinuation() {
    setContinuing(true); setContinueError(null)
    try {
      await continueRun({ data: { runId: run.id } })
      await router.invalidate({ sync: true })
    } catch (error) { setContinueError(error instanceof Error ? error.message : 'Could not continue collection') }
    finally { setContinuing(false) }
  }

  useEffect(() => {
    if (!active) return
    const interval = window.setInterval(() => { void router.invalidate() }, 2000)
    return () => window.clearInterval(interval)
  }, [active, router])

  return (
    <main className="w-full px-2 py-3 sm:px-3" id="main-content">
      <Link className={buttonStyles({ variant: 'ghost' })} to="/sources">← Sources</Link>
      <h1 className="mt-2 text-base font-semibold text-foreground">{sourceName}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 rounded border border-border bg-card p-3">
        <Badge variant={run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'success' : 'info'}>{run.status.replace('_', ' ')}</Badge>
        <span className="text-sm text-muted-foreground">{run.requestCount} of {run.requestLimit} requests</span>
        <span className="text-sm text-muted-foreground">{run.pageCount} pages · {run.productCount} products</span>
      </div>
      {active ? <p className="mt-3 text-sm text-muted-foreground" role="status">Watching live. You can leave this page; collection continues in the background.</p> : null}
      {run.status === 'queued' && run.nextAllowedAt ? <p className="mt-3 text-sm text-muted-foreground">Next allowed attempt in {Math.floor(remainingSeconds / 60)}m {String(remainingSeconds % 60).padStart(2, '0')}s: <time dateTime={run.nextAllowedAt.toISOString()}>{run.nextAllowedAt.toLocaleString()}</time>. Minimum pacing and source Retry-After cannot be shortened.</p> : null}
      {canContinue ? <button className={buttonStyles({ variant: 'secondary' })} disabled={continuing} onClick={() => void requestContinuation()}>{continuing ? 'Continuing…' : 'Continue sooner'}</button> : null}
      {continueError ? <p className="mt-2 text-sm text-destructive" role="alert">{continueError}</p> : null}
      {run.status === 'partial' ? <p className="mt-3 rounded-lg border border-border bg-muted p-4 text-sm text-foreground">{run.error ?? 'This run reached its request ceiling.'} The products shown were saved, but more pages may exist. Absence from this partial snapshot does not mean an item disappeared.</p> : null}
      {run.status === 'failed' && run.error ? <p className="mt-3 rounded-lg border border-destructive p-4 text-sm text-destructive" role="alert">{run.error}</p> : null}
      <div className="mt-5"><Link className={buttonStyles({ variant: 'secondary' })} to="/listings">View listings</Link></div>
      <section className="mt-4" aria-label="Run log">
        <h2 className="text-sm font-semibold text-foreground">Run log</h2>
        <ol className="mt-2 space-y-1" aria-live="polite">
          {events.map((event) => (
            <li className="border-b border-border bg-card px-2 py-1" key={event.id}>
              <time className="block text-xs text-muted-foreground" dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleString()}</time>
              <p className="mt-1 text-sm text-foreground">{event.message}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
