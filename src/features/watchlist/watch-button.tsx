import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { setListingWatched } from './watchlist.functions'

/** Small optimistic control suitable for dense tables and listing detail views. */
export function WatchButton({ listingId, initialWatched, onChanged }: {
  listingId: string
  initialWatched: boolean
  onChanged?: (watched: boolean) => void
}) {
  const setWatched = useServerFn(setListingWatched)
  const [watched, setLocalWatched] = useState(initialWatched)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function toggle() {
    const next = !watched
    setBusy(true); setError(''); setLocalWatched(next)
    try {
      await setWatched({ data: { listingId, watched: next } })
      onChanged?.(next)
    } catch (cause) {
      setLocalWatched(!next)
      setError(cause instanceof Error ? cause.message : 'Could not update watch')
    } finally { setBusy(false) }
  }
  return <span className="inline-flex items-center gap-1"><button type="button" className={`rounded border px-1.5 py-0.5 text-xs ${watched ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`} onClick={() => void toggle()} disabled={busy} aria-pressed={watched}>{busy ? '…' : watched ? 'Watching' : 'Watch'}</button>{error ? <span className="sr-only" role="alert">{error}</span> : null}</span>
}
