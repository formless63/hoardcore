import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { createCurrentUserLoxepConnection, listLoxepConnectionsForCurrentUser, revokeCurrentUserLoxepConnection } from '~/features/loxep/loxep.functions'
import { SettingsLoadError, SettingsPending } from '~/features/settings/settings-load-state'

export const Route = createFileRoute('/settings/loxep')({
  loader: () => listLoxepConnectionsForCurrentUser(),
  head: () => ({ meta: [{ title: 'Loxep connections · Hoardcore' }] }),
  pendingMs: 100,
  pendingComponent: SettingsPending,
  errorComponent: SettingsLoadError,
  component: LoxepSettingsPage,
})

function LoxepSettingsPage() {
  const connections = Route.useLoaderData()
  const router = useRouter()
  const create = useServerFn(createCurrentUserLoxepConnection)
  const revoke = useServerFn(revokeCurrentUserLoxepConnection)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [remoteConnectionId, setRemoteConnectionId] = useState('')
  const [ingestToken, setIngestToken] = useState('')
  const [revealed, setRevealed] = useState<{ connectionId: string; token: string; path: string } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setRevealed(null)
    try {
      const result = await create({ data: { name, baseUrl, remoteConnectionId, ingestToken } })
      setRevealed({ connectionId: result.connectionId, token: result.callbackToken, path: result.callbackPath })
      setName(''); setBaseUrl(''); setRemoteConnectionId(''); setIngestToken('')
      await router.invalidate({ sync: true })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create the connection') }
    finally { setBusy(false) }
  }

  async function remove(connectionId: string) {
    setBusy(true); setMessage('')
    try { await revoke({ data: { connectionId } }); await router.invalidate({ sync: true }) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not revoke the connection') }
    finally { setBusy(false) }
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <div className="flex items-center gap-3"><h1 className="text-base font-semibold">Loxep connections</h1><Link to="/settings" className="text-xs text-primary underline">Back to settings</Link></div>
    <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Connect Hoardcore to a Loxep installation. The outbound bearer token is encrypted in the database; the callback token is shown once for a future Loxep outcome webhook.</p>
    <form className="mt-4 max-w-xl rounded-md border border-border bg-card p-4" onSubmit={(event) => void submit(event)}>
      <h2 className="text-sm font-semibold">Add Loxep</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Name<Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="Main Loxep" maxLength={120} /></label>
        <label className="text-xs text-muted-foreground">Loxep URL<Input className="mt-1" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://loxep.example.test" type="url" /></label>
        <label className="text-xs text-muted-foreground">Loxep connection ID<Input className="mt-1" value={remoteConnectionId} onChange={(event) => setRemoteConnectionId(event.target.value)} placeholder="UUID from Loxep" /></label>
        <label className="text-xs text-muted-foreground">Loxep ingest token<Input className="mt-1" value={ingestToken} onChange={(event) => setIngestToken(event.target.value)} placeholder="Paste once from Loxep" type="password" /></label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Create an “Hoardcore opportunity source” in Loxep first, then paste its connection ID and bearer token here.</p>
      <div className="mt-4 flex items-center gap-3"><Button type="submit" size="small" disabled={busy || !name.trim() || !baseUrl.trim() || !remoteConnectionId.trim() || !ingestToken.trim()}>{busy ? 'Saving…' : 'Connect Loxep'}</Button>{message ? <span className="text-xs text-destructive" role="alert">{message}</span> : null}</div>
    </form>
    {revealed ? <section className="mt-4 max-w-xl rounded-md border border-warning/50 bg-card p-4 text-xs"><h2 className="font-semibold">Outcome webhook token — copy now</h2><p className="mt-1 text-muted-foreground">This token is not stored in plaintext and will not be shown again.</p><p className="mt-3 text-muted-foreground">Webhook URL</p><code className="mt-1 block break-all rounded bg-muted p-2 select-all">{origin}{revealed.path}</code><p className="mt-3 text-muted-foreground">Bearer token</p><code className="mt-1 block break-all rounded bg-muted p-2 select-all">{revealed.token}</code><p className="mt-2 text-muted-foreground">On Loxep, choose Configure callback for this source and paste these values. Lifecycle event producers are still a follow-up.</p></section> : null}
    <section className="mt-5 overflow-x-auto"><h2 className="text-sm font-semibold">Configured connections</h2><table className="mt-2 w-full max-w-4xl text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-1">Name</th><th>URL</th><th>Status</th><th>Last publish</th><th /></tr></thead><tbody>{connections.map((connection) => <tr key={connection.id} className="border-t border-border"><td className="py-2 pr-3">{connection.name}<span className="block text-muted-foreground">{connection.remoteConnectionId}</span></td><td>{connection.baseUrl}</td><td>{connection.status}</td><td>{connection.lastDelivery ? `${connection.lastDelivery.status} · ${connection.lastDelivery.updatedAt.toLocaleString()}` : '—'}{connection.lastDelivery?.lastError ? <span className="block text-destructive">{connection.lastDelivery.lastError}</span> : null}</td><td>{connection.status !== 'revoked' ? <button type="button" className="text-destructive underline" disabled={busy} onClick={() => void remove(connection.id)}>Revoke</button> : null}</td></tr>)}</tbody></table></section>
  </main>
}
