import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { getPublicSession } from '~/features/auth/auth.functions'
import { createResearchAgentToken, listResearchAgentTokens, revokeResearchAgentToken } from '~/features/research/research.functions'

export const Route = createFileRoute('/settings/research-tokens')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: () => listResearchAgentTokens(),
  head: () => ({ meta: [{ title: 'Research API tokens · Hoardcore' }] }),
  component: ResearchTokensPage,
})

function ResearchTokensPage() {
  const tokens = Route.useLoaderData()
  const router = useRouter()
  const create = useServerFn(createResearchAgentToken)
  const revoke = useServerFn(revokeResearchAgentToken)
  const [name, setName] = useState('')
  const [revealed, setRevealed] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function issue() {
    setBusy(true); setMessage(''); setRevealed('')
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString()
      const result = await create({ data: { name, expiresAt } })
      setRevealed(result.token); setName('')
      await router.invalidate({ sync: true })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create token') }
    finally { setBusy(false) }
  }
  async function remove(id: string) {
    setBusy(true); setMessage('')
    try { await revoke({ data: { id } }); await router.invalidate({ sync: true }) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not revoke token') }
    finally { setBusy(false) }
  }
  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <h1 className="text-sm font-medium">Research API tokens</h1>
    <p className="mt-1 text-xs text-muted-foreground">Issue a 30-day, research-write-only bearer token for a coding agent. Copy it now; only its hash is stored.</p>
    <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Token name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Agent name" className="h-8 w-56 rounded border border-border bg-background px-2 text-xs" /><button type="button" disabled={busy || !name.trim()} onClick={() => void issue()} className="h-8 rounded bg-primary px-2 text-xs text-primary-foreground disabled:opacity-40">Create token</button></div>
    {revealed ? <div className="mt-3 rounded border border-border bg-card p-2 text-xs"><p>Copy this token now. It will not be shown again.</p><code className="mt-1 block break-all select-all rounded bg-muted p-2">{revealed}</code><button type="button" className="mt-1 text-primary underline" onClick={() => void navigator.clipboard.writeText(revealed)}>Copy</button></div> : null}
    {message ? <p className="mt-2 text-xs text-destructive" role="alert">{message}</p> : null}
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="py-1">Name</th><th>Created</th><th>Expires</th><th>Last used</th><th>Status</th><th /></tr></thead><tbody>{tokens.map((token) => <tr key={token.id} className="border-t border-border"><td className="py-1.5">{token.name}</td><td>{token.createdAt.toLocaleDateString()}</td><td>{token.expiresAt?.toLocaleDateString() ?? 'Never'}</td><td>{token.lastUsedAt?.toLocaleDateString() ?? '—'}</td><td>{token.revokedAt ? 'Revoked' : token.expiresAt && token.expiresAt < new Date() ? 'Expired' : 'Active'}</td><td>{!token.revokedAt ? <button type="button" disabled={busy} onClick={() => void remove(token.id)} className="text-destructive underline">Revoke</button> : null}</td></tr>)}</tbody></table></div>
  </main>
}
