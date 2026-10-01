import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { getSourceSafety, saveSourceSafety, setSourceSafetyBreak, requestSourceSafetyProbe } from './response-safety.functions'
import { responseEventLabels, responseEventTypes, responsePolicySchema, type ResponsePolicy } from './response-policy'

type Safety = Awaited<ReturnType<typeof getSourceSafety>>
const numericFields: Array<{ name: keyof Pick<ResponsePolicy, 'minimumDelaySeconds' | 'minimumScanHours' | 'throttleCooldownHours' | 'throttleMultiplier' | 'throttleMaxHours' | 'throttlePauseAfter'>; label: string; min: number; max: number }> = [
  { name: 'minimumDelaySeconds', label: 'Between requests (seconds)', min: 10, max: 3600 },
  { name: 'minimumScanHours', label: 'Between scans (hours)', min: 1, max: 8760 },
  { name: 'throttleCooldownHours', label: 'First 429 break (hours)', min: 24, max: 8760 },
  { name: 'throttleMultiplier', label: 'Repeated 429 multiplier', min: 1, max: 10 },
  { name: 'throttleMaxHours', label: 'Maximum 429 break (hours)', min: 24, max: 8760 },
  { name: 'throttlePauseAfter', label: '429 strikes before review', min: 1, max: 10 },
]
const inputClass = 'mt-1 w-full rounded border border-border bg-background p-1.5 text-foreground'

export function useSourceSafety(sourceId: string) {
  const get = useServerFn(getSourceSafety)
  return useQuery({ queryKey: ['source-safety', sourceId], queryFn: () => get({ data: { sourceId } }), refetchInterval: 30_000 })
}
export function SourceSafetyControl({ sourceId, query }: { sourceId: string; query: ReturnType<typeof useSourceSafety> }) {
  return <details className="rounded border border-border/70 p-2">
    <summary className="cursor-pointer text-xs font-medium">Response safety{query.data?.state?.paused ? ' · paused for review' : query.data?.state?.blockedUntil && query.data.state.blockedUntil > new Date() ? ' · cooling down' : ''}</summary>
    {query.isPending ? <p className="mt-2 text-xs">Loading safety settings…</p> : query.error ? <p role="alert" className="mt-2 text-xs text-destructive">{query.error.message}</p> : query.data ? <SafetyEditor key={`${sourceId}:${JSON.stringify(query.data.policy)}:${query.data.eventTypes.join(',')}`} sourceId={sourceId} safety={query.data} /> : null}
  </details>
}

function SafetyEditor({ sourceId, safety }: { sourceId: string; safety: Safety }) {
  const save = useServerFn(saveSourceSafety)
  const changeBreak = useServerFn(setSourceSafetyBreak)
  const probe = useServerFn(requestSourceSafetyProbe)
  const router = useRouter()
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [breakHours, setBreakHours] = useState(72)
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['source-safety', sourceId] }); await router.invalidate({ sync: true }) }
  const mutation = useMutation({ mutationFn: async (action: 'break' | 'pause' | 'resume' | 'probe') => {
    if (action === 'probe') await probe({ data: { sourceId } })
    else await changeBreak({ data: { sourceId, action, hours: breakHours } })
  }, onSuccess: refresh })
  const form = useForm({ defaultValues: { policy: safety.policy, eventTypes: safety.eventTypes }, onSubmit: async ({ value }) => {
    setMessage('')
    const parsed = responsePolicySchema.safeParse(value.policy)
    if (!parsed.success) { setMessage(parsed.error.issues.map(issue => issue.message).join('; ')); return }
    try { await save({ data: { sourceId, policy: parsed.data, eventTypes: value.eventTypes } }); await refresh(); setMessage('Safety settings saved') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save settings') }
  } })
  const requiredBreak = Boolean(safety.state?.blockedUntil && safety.state.blockedUntil > new Date())
  const scanInterval = Boolean(safety.state?.lastScanAt && safety.state.lastScanAt.getTime() + safety.policy.minimumScanHours * 3_600_000 > Date.now())
  return <div className="mt-3 space-y-3 text-xs">
    <p className="text-muted-foreground">Safety gates are shared by all collections on {safety.origin}. A response rule stops the run immediately. Longer source Retry-After delays always take precedence.</p>
    {safety.state?.reason ? <p role="status" className="rounded border border-border p-2">{safety.state.reason}{safety.state.blockedUntil ? ` Required break ends ${safety.state.blockedUntil.toLocaleString()}.` : ''} {safety.state.throttleStrikes} rate-limit strikes.</p> : null}
    {safety.state?.lastScanAt ? <p className="text-muted-foreground">Last scan started {safety.state.lastScanAt.toLocaleString()}. Minimum interval ends {new Date(safety.state.lastScanAt.getTime() + safety.policy.minimumScanHours * 3_600_000).toLocaleString()}.</p> : null}
    <form onSubmit={event => { event.preventDefault(); void form.handleSubmit() }} className="space-y-3">
      <form.Field name="policy">{field => <>
        <div className="grid gap-3 sm:grid-cols-3">{numericFields.map(({ name, label, min, max }) => <label key={name}>{label}<input className={inputClass} type="number" min={min} max={max} step={name === 'throttleMultiplier' ? '0.1' : 1} required value={field.state.value[name]} onChange={event => field.handleChange({ ...field.state.value, [name]: Number(event.target.value) })} /></label>)}</div>
        <p className="text-muted-foreground">429: stop, apply an escalating break, then pause for review at the strike limit. Only a complete successful collection resets strikes. Scheduled times inside the minimum scan interval are skipped.</p>
        <div className="grid gap-2">{(['access_denied', 'server_error', 'timeout', 'network_error', 'invalid_response'] as const).map(eventType => <div key={eventType} className="grid items-end gap-2 sm:grid-cols-3">
          <span>{responseEventLabels[eventType]}</span>
          <label>Reaction<select className={inputClass} value={field.state.value[eventType].action} onChange={event => field.handleChange({ ...field.state.value, [eventType]: { ...field.state.value[eventType], action: event.target.value as 'cooldown' | 'pause' } })}><option value="cooldown">Break, then allow next scan</option><option value="pause">Break and pause for review</option></select></label>
          <label>Break (hours)<input className={inputClass} type="number" min={1} max={8760} required value={field.state.value[eventType].cooldownHours} onChange={event => field.handleChange({ ...field.state.value, [eventType]: { ...field.state.value[eventType], cooldownHours: Number(event.target.value) } })} /></label>
        </div>)}</div>
      </>}</form.Field>
      <fieldset className="rounded border border-border p-2"><legend className="px-1">Notify me when</legend>
        <form.Field name="eventTypes">{field => <div className="flex flex-wrap gap-3">{responseEventTypes.map(type => <label className="flex items-center gap-1" key={type}><input type="checkbox" checked={field.state.value.includes(type)} onChange={event => field.handleChange(event.target.checked ? [...field.state.value, type] : field.state.value.filter(value => value !== type))} />{responseEventLabels[type]}</label>)}</div>}</form.Field>
        <p className="mt-2 text-muted-foreground">{safety.notificationsReady ? 'Uses your configured ntfy delivery settings.' : 'Enable ntfy delivery before these subscriptions can send notifications.'} <Link to="/settings/alerts" className="text-primary underline">Notification settings</Link></p>
      </fieldset>
      <form.Subscribe selector={state => state.isSubmitting}>{busy => <Button size="small" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save safety settings'}</Button>}</form.Subscribe>
      {message ? <p role="status">{message}</p> : null}
    </form>
    <div className="flex flex-wrap items-end gap-2"><label>Operator break (hours)<input className={inputClass} type="number" min={1} max={8760} value={breakHours} onChange={event => setBreakHours(Number(event.target.value))} /></label>
      <Button size="small" disabled={mutation.isPending} onClick={() => mutation.mutate('break')}>Take / extend break</Button>
      <Button size="small" disabled={mutation.isPending} onClick={() => mutation.mutate('pause')}>Pause for review</Button>
      <Button size="small" disabled={mutation.isPending || requiredBreak || !safety.state?.paused} onClick={() => mutation.mutate('resume')}>Resume after review</Button>
      <Button size="small" disabled={mutation.isPending || !safety.collectionEnabled || requiredBreak || scanInterval || safety.state?.paused} onClick={() => mutation.mutate('probe')}>Queue one-request probe</Button>
    </div>
    {mutation.error ? <p role="alert" className="text-destructive">{mutation.error.message}</p> : null}
    <p className="text-muted-foreground">Existing breaks cannot be shortened. Resume unlocks an operator pause only after the required break ends. A probe has a one-request ceiling including any required robots.txt preflight, and respects the minimum scan interval.</p>
    <details><summary className="cursor-pointer">Recent safety events</summary><ul className="mt-2 space-y-2">{safety.events.map(event => <li key={event.id}><time>{event.createdAt.toLocaleString()}</time> · {event.message}</li>)}</ul>{!safety.events.length ? <p className="mt-2 text-muted-foreground">No safety events recorded.</p> : null}</details>
  </div>
}
