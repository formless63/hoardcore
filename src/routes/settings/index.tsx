import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { getOperatorSettings, saveOperatorSettings } from '~/features/settings/settings.functions'
import { SettingsLoadError, SettingsPending } from '~/features/settings/settings-load-state'
import { settingsSections } from '~/features/settings/settings-navigation'

export const Route = createFileRoute('/settings/')({
  loader: () => getOperatorSettings(),
  head: () => ({ meta: [{ title: 'Settings · Hoardcore' }] }),
  pendingMs: 100,
  pendingComponent: SettingsPending,
  errorComponent: SettingsLoadError,
  component: SettingsPage,
})

function SettingsPage() {
  const settings = Route.useLoaderData()
  const save = useServerFn(saveOperatorSettings)
  const router = useRouter()
  const [limit, setLimit] = useState(settings.defaultCollectionRequestLimit)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setMessage('')
    try {
      await save({ data: { defaultCollectionRequestLimit: limit } })
      await router.invalidate({ sync: true })
      setMessage('Saved. New run controls use this default; existing runs are unchanged.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save settings')
    } finally { setBusy(false) }
  }

  return (
    <main className="w-full px-2 py-3 sm:px-3" id="main-content">
      <h1 className="text-base font-semibold text-foreground">General settings</h1>
      <p className="mt-1 text-xs text-muted-foreground">Manage configuration here. Use Sources to run collections and follow their progress.</p>
      <section aria-label="Settings sections" className="my-4 grid max-w-5xl gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {settingsSections.filter(section => section.to !== '/settings').map(section => <Link key={section.to} to={section.to} className="rounded border border-border bg-card p-3 hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-ring">
          <h2 className="text-sm font-medium text-foreground">{section.label} <span aria-hidden="true">→</span></h2>
          <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
        </Link>)}
      </section>
      <form className="max-w-xl rounded-md border border-border bg-card p-4" onSubmit={(event) => void submit(event)}>
        <h2 className="text-sm font-semibold text-foreground">Collection defaults</h2>
        <label className="mt-3 block text-xs text-muted-foreground" htmlFor="default-request-limit">Default request ceiling</label>
        <div className="mt-1 flex items-center gap-3">
          <Input id="default-request-limit" className="w-24" type="number" min={2} max={20} step={1} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
          <span className="text-xs text-muted-foreground">2–20 requests per manual run, including the access-policy check.</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">The default pre-fills new run controls. You can override it for an individual run; it does not alter pacing or retry policy.</p>
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" size="small" disabled={busy || !Number.isInteger(limit) || limit < 2 || limit > 20}>{busy ? 'Saving…' : 'Save settings'}</Button>
          {message ? <span className="text-xs text-muted-foreground" role="status">{message}</span> : null}
        </div>
      </form>
    </main>
  )
}
