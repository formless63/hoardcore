import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { updateSourceSchedule } from './sources.functions'
import type { CatalogSourceSummary } from './sources.schemas'
import { describeCron, EXAMPLE_SCHEDULE_CRON, formatScheduledDate, validateCollectionCron } from './source-schedule'

export function SourceScheduleControl({ source }: { source: CatalogSourceSummary }) {
  const router = useRouter()
  const saveSchedule = useServerFn(updateSourceSchedule)
  const [enabled, setEnabled] = useState(source.collectionEnabled)
  const [cron, setCron] = useState(source.scheduleCron ?? '')
  const [timeZone, setTimeZone] = useState(source.scheduleTimezone)
  const [requestLimit, setRequestLimit] = useState(source.scheduleRequestLimit)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeZoneListId = `schedule-timezones-${source.id}`
  const cronError = useMemo(() => cron ? validateCollectionCron(cron, timeZone) : null, [cron, timeZone])
  const changed = enabled !== source.collectionEnabled || cron !== (source.scheduleCron ?? '') || timeZone !== source.scheduleTimezone || requestLimit !== source.scheduleRequestLimit || source.legacyScheduleHours !== null

  async function save() {
    if (busy || !changed || cronError) return
    setBusy(true); setError(null)
    try {
      await saveSchedule({ data: { sourceId: source.id, collectionEnabled: enabled, scheduleCron: cron || null, scheduleTimezone: timeZone, scheduleRequestLimit: requestLimit } })
      await router.invalidate({ sync: true })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save schedule') }
    finally { setBusy(false) }
  }

  return <div className="grid gap-2 text-xs lg:grid-cols-[auto_minmax(13rem,1fr)_minmax(12rem,1fr)_auto_auto] lg:items-end">
    <label className="flex h-8 items-center gap-2 whitespace-nowrap text-muted-foreground"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Collection enabled</label>
    <label className="text-muted-foreground">Cron schedule
      <Input aria-label={`Cron schedule for ${source.displayName}`} className="mt-1 h-8 font-mono text-xs" value={cron} disabled={!enabled} placeholder={EXAMPLE_SCHEDULE_CRON} onChange={(event) => setCron(event.target.value)} />
    </label>
    <label className="text-muted-foreground">Timezone
      <Input aria-label={`Schedule timezone for ${source.displayName}`} className="mt-1 h-8 text-xs" list={timeZoneListId} value={timeZone} disabled={!enabled || !cron} onChange={(event) => setTimeZone(event.target.value)} />
      <datalist id={timeZoneListId}><option value="UTC" /><option value="America/New_York" /><option value="America/Chicago" /><option value="America/Denver" /><option value="America/Los_Angeles" /></datalist>
    </label>
    <label className="text-muted-foreground" title="Hard cap for the whole scheduled collection, including access-policy checks and retries.">Max requests
      <Input aria-label={`Scheduled maximum requests for ${source.displayName}`} className="mt-1 !h-7 !w-12 !px-1.5" type="number" min={2} max={20} step={1} value={requestLimit} disabled={!enabled || !cron} onChange={(event) => setRequestLimit(Number(event.target.value))} />
    </label>
    <Button size="small" variant="secondary" disabled={!changed || busy || Boolean(cronError) || !Number.isInteger(requestLimit) || requestLimit < 2 || requestLimit > 20} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Button>
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-muted-foreground lg:col-span-5">
      <span>{source.legacyScheduleHours !== null && !source.scheduleCron ? `Legacy every ${source.legacyScheduleHours} hours — replace with cron to anchor it to wall-clock time.` : cron ? describeCron(cron, timeZone) : enabled ? 'Manual only; no automatic requests.' : 'Collection paused; manual and scheduled runs disabled.'} {enabled && !cron ? <button type="button" className="text-primary hover:underline" onClick={() => setCron(EXAMPLE_SCHEDULE_CRON)}>Use 9 AM + 9 PM</button> : null}</span>
      {source.nextRunAt && source.collectionEnabled ? <span>Next: {formatScheduledDate(source.nextRunAt, source.scheduleTimezone)}</span> : null}
    </div>
    {cronError ? <span role="alert" className="text-destructive lg:col-span-5">{cronError}</span> : null}
    {error ? <span role="alert" className="text-destructive lg:col-span-5">{error}</span> : null}
  </div>
}
