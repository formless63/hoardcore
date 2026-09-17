import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { updateSourceSchedule } from './sources.functions'
import type { CatalogSourceSummary } from './sources.schemas'

export function SourceScheduleControl({ source }: { source: CatalogSourceSummary }) {
  const router = useRouter()
  const saveSchedule = useServerFn(updateSourceSchedule)
  const [enabled, setEnabled] = useState(source.collectionEnabled)
  const [hours, setHours] = useState<number | null>(source.scheduleHours)
  const [requestLimit, setRequestLimit] = useState(source.scheduleRequestLimit)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = enabled !== source.collectionEnabled || hours !== source.scheduleHours || requestLimit !== source.scheduleRequestLimit
  async function save() {
    if (busy || !changed) return
    setBusy(true); setError(null)
    try {
      await saveSchedule({ data: { sourceId: source.id, collectionEnabled: enabled, scheduleHours: hours as 24 | 72 | 168 | null, scheduleRequestLimit: requestLimit } })
      await router.invalidate({ sync: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save schedule') }
    finally { setBusy(false) }
  }
  return <div className="flex flex-wrap items-end justify-end gap-2 border-t border-border pt-2 text-xs">
    <label className="flex items-center gap-2 text-muted-foreground">
      <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      Collection enabled
    </label>
    <label className="flex flex-col gap-1 text-muted-foreground">Schedule
      <select className="h-8 rounded-md border border-input bg-background px-2 text-foreground" value={hours ?? ''} disabled={!enabled} onChange={(event) => setHours(event.target.value ? Number(event.target.value) : null)}>
        <option value="">Manual only</option>
        <option value="24">Every day</option>
        <option value="72">Every 3 days</option>
        <option value="168">Every week</option>
      </select>
    </label>
    <label className="flex flex-col gap-1 text-muted-foreground">Scheduled request ceiling
      <Input className="h-8 w-20" type="number" min={2} max={20} step={1} value={requestLimit} disabled={!enabled || !hours} onChange={(event) => setRequestLimit(Number(event.target.value))} />
    </label>
    <Button size="small" variant="secondary" disabled={!changed || busy || !Number.isInteger(requestLimit) || requestLimit < 2 || requestLimit > 20} onClick={() => void save()}>{busy ? 'Saving…' : 'Save schedule'}</Button>
    {source.nextRunAt && source.collectionEnabled ? <span className="w-full text-right text-muted-foreground">Next scheduled run {new Date(source.nextRunAt).toLocaleString()}</span> : <span className="w-full text-right text-muted-foreground">{source.collectionEnabled ? 'Manual only · no automatic requests' : 'Collection paused · manual and scheduled runs disabled'}</span>}
    {error ? <span role="alert" className="w-full text-right text-destructive">{error}</span> : null}
  </div>
}
