import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getNotificationSettings, listAlertSubscriptions, saveNotificationSettings, saveSavedViewAlertPreference, saveWatchedAlertPreference } from '~/features/alerts/alerts.functions'

export const Route = createFileRoute('/settings/alerts')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: async () => ({ settings: await getNotificationSettings(), subscriptions: await listAlertSubscriptions() }),
  head: () => ({ meta: [{ title: 'Notification settings · Hoardcore' }] }),
  component: AlertSettingsPage,
})

function AlertSettingsPage() {
  const { settings, subscriptions } = Route.useLoaderData()
  const save = useServerFn(saveNotificationSettings)
  const router = useRouter()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [endpoint, setEndpoint] = useState(settings.endpoint)
  const [topic, setTopic] = useState(settings.topic ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const saveWatch = useServerFn(saveWatchedAlertPreference)
  const saveView = useServerFn(saveSavedViewAlertPreference)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    try { await save({ data: { enabled, endpoint, topic } }); await router.invalidate({ sync: true }); setMessage('Saved. Delivery remains queued until the application worker evaluates a new observation.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save notification settings') }
    finally { setBusy(false) }
  }
  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <div className="mb-3 flex items-center gap-3"><Link to="/settings" className="text-xs text-primary underline">← Settings</Link><h1 className="text-sm font-medium">Notifications</h1></div>
    <form className="max-w-xl rounded border border-border bg-card p-3 text-xs" onSubmit={(event) => void submit(event)}>
      <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span className="font-medium">Enable ntfy notifications</span></label>
      <p className="mt-1 text-muted-foreground">Alerts are evaluated for your watched listings and saved listing views. Nothing is sent while this is disabled.</p>
      <label className="mt-4 block text-muted-foreground" htmlFor="ntfy-endpoint">Public HTTPS ntfy origin</label>
      <Input id="ntfy-endpoint" className="mt-1" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://ntfy.example.com" />
      <label className="mt-3 block text-muted-foreground" htmlFor="ntfy-topic">Topic</label>
      <Input id="ntfy-topic" className="mt-1" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="private-topic" />
      <p className="mt-1 text-muted-foreground">Use a private, unguessable topic. This initial adapter deliberately does not store ntfy access credentials.</p>
      <div className="mt-4 flex items-center gap-3"><Button type="submit" size="small" disabled={busy}>{busy ? 'Saving…' : 'Save notification settings'}</Button>{message ? <span role="status" className="text-muted-foreground">{message}</span> : null}</div>
    </form>
    <section className="mt-4 max-w-xl rounded border border-border bg-card p-3 text-xs"><h2 className="font-medium">Alert rules</h2><p className="mt-1 text-muted-foreground">Choose which watched listings or saved views may create a delivery. This is separate from globally enabling ntfy above.</p><div className="mt-3 space-y-2">{subscriptions.watches.map((watch) => <AlertRule key={watch.listingId} label={watch.title} enabled={watch.enabled} eventTypes={watch.eventTypes} onSave={(nextEnabled, nextTypes) => saveWatch({ data: { listingId: watch.listingId, enabled: nextEnabled, eventTypes: nextTypes } })} />)}{subscriptions.views.map((view) => <AlertRule key={view.savedViewId} label={`View: ${view.name}`} enabled={view.enabled} eventTypes={view.eventTypes} onSave={(nextEnabled, nextTypes) => saveView({ data: { savedViewId: view.savedViewId, enabled: nextEnabled, eventTypes: nextTypes } })} />)}{!subscriptions.watches.length && !subscriptions.views.length ? <p className="text-muted-foreground">Watch listings or save a listing view to configure alert rules.</p> : null}</div></section>
  </main>
}

const eventLabels = { new_match: 'New match', price_change: 'Price', availability_change: 'Availability' } as const
type EventType = keyof typeof eventLabels
function AlertRule({ label, enabled: initialEnabled, eventTypes: initialTypes, onSave }: { label: string; enabled: boolean; eventTypes: EventType[]; onSave: (enabled: boolean, eventTypes: EventType[]) => Promise<unknown> }) {
  const [enabled, setEnabled] = useState(initialEnabled); const [types, setTypes] = useState<EventType[]>(initialTypes); const [busy, setBusy] = useState(false)
  function toggleType(type: EventType) { setTypes((current) => current.includes(type) ? current.filter((value) => value !== type) : [...current, type]) }
  async function saveRule() { if (!types.length) return; setBusy(true); try { await onSave(enabled, types) } finally { setBusy(false) } }
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2"><span className="min-w-40 flex-1 truncate" title={label}>{label}</span><label className="flex items-center gap-1"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Alert</label>{(Object.keys(eventLabels) as EventType[]).map((type) => <label key={type} className="flex items-center gap-1 text-muted-foreground"><input type="checkbox" checked={types.includes(type)} onChange={() => toggleType(type)} /> {eventLabels[type]}</label>)}<button type="button" className="text-primary underline disabled:opacity-50" disabled={busy || !types.length} onClick={() => void saveRule()}>{busy ? 'Saving…' : 'Save'}</button></div>
}
