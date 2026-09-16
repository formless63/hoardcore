import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getCollectionRun } from '~/features/sources/sources.functions'
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
