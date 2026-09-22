import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { getOperatorSettings, saveOperatorSettings } from '~/features/settings/settings.functions'
import { SettingsLoadError, SettingsPending } from '~/features/settings/settings-load-state'

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
      <h1 className="mb-3 text-base font-semibold text-foreground">Settings</h1>
      <Link to="/settings/alerts" className="mb-3 inline-block text-xs text-primary underline">Notification settings and alert rules</Link>
      <Link to="/settings/research-tokens" className="mb-3 ml-3 inline-block text-xs text-primary underline">Research API tokens</Link>
      <Link to="/settings/category-groups" className="mb-3 ml-3 inline-block text-xs text-primary underline">Category mappings</Link>
      <Link to="/settings/loxep" className="mb-3 ml-3 inline-block text-xs text-primary underline">Loxep connections</Link>
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
