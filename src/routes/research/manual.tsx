import { createFileRoute, redirect } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { buttonStyles } from '~/components/ui/button'
import { getPublicSession } from '~/features/auth/auth.functions'
import { importPastedResearch, saveResearchPacket } from '~/features/research/research.functions'
import { parseResearchPacket } from '~/features/research/research.schemas'
import { createResearchExport } from '~/features/catalog/catalog.functions'
import { z } from 'zod'

export const Route = createFileRoute('/research/manual')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  validateSearch: z.object({ listingId: z.uuid().optional() }),
  loaderDeps: ({ search }) => ({ listingId: search.listingId }),
  loader: async ({ deps }) => deps.listingId ? createResearchExport({ data: { listingIds: [deps.listingId] } }) : null,
  head: () => ({ meta: [{ title: 'Manual research · Hoardcore' }] }),
  component: ManualResearchPage,
})

function ManualResearchPage() {
  const exported = Route.useLoaderData()
  const [packetJson, setPacketJson] = useState(() => exported ? exported.packetJson : '')
  const [channel, setChannel] = useState('')
  const [kind, setKind] = useState<'active_asking' | 'completed_sale' | 'retail_offer'>('completed_sale')
  const [price, setPrice] = useState('')
  const [shipping, setShipping] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState<string>()
  const [busy, setBusy] = useState(false)
  const packet = useMemo(() => { try { return packetJson ? parseResearchPacket(JSON.parse(packetJson)) : undefined } catch { return undefined } }, [packetJson])

  async function submit() {
    const hasComparable = Boolean(channel.trim() || price.trim())
    const comparableValid = Boolean(channel.trim()) && Number.isFinite(Number(price)) && Number(price) >= 0
    if (!packet || (!notes.trim() && !hasComparable) || (hasComparable && !comparableValid)) { setMessage('Paste a valid packet, then add notes or provide both a channel and non-negative price.'); return }
    setBusy(true); setMessage(undefined)
    try {
      await saveResearchPacket({ data: { packet } })
      const result = {
        resultVersion: packet.schemaVersion, packetVersion: packet.packetVersion, promptVersion: packet.promptVersion, schemaVersion: packet.schemaVersion,
        packetId: packet.packetId, resultId: `manual-${crypto.randomUUID()}`, completedAt: new Date().toISOString(),
        records: packet.records.map((record, index) => ({ reference: record.reference, status: 'valid' as const, claims: notes.trim() ? [{ field: 'notes', value: notes.trim(), citationIds: [] }] : [], marketEstimates: [], risks: [], citations: url ? [{ citationId: `manual-${index + 1}`, url }] : [], diagnostics: [], ...(comparableValid ? { comparables: [{ comparableId: `manual-${index + 1}`, channel: channel.trim(), evidenceType: kind, price: Number(price), ...(shipping ? { shipping: Number(shipping) } : {}), currency: currency.toUpperCase(), ...(url ? { url, citationId: `manual-${index + 1}` } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), observedAt: new Date().toISOString() }] } : {}) })),
      }
      const saved = await importPastedResearch({ data: { resultJson: JSON.stringify(result) } })
      setMessage(`Saved ${saved.comparableCount} manual comparable${saved.comparableCount === 1 ? '' : 's'}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save manual research') }
    finally { setBusy(false) }
  }

  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <h1 className="text-base font-semibold">Manual comparable</h1>
    <p className="mt-1 text-xs text-muted-foreground">Paste an exported ResearchPacket, then record notes, a market comparable, or both. Use one-record packets for item-specific research.</p>
    <label className="mt-3 block text-xs font-medium">ResearchPacket JSON<textarea value={packetJson} onChange={(event) => setPacketJson(event.target.value)} spellCheck={false} className="mt-1 min-h-40 w-full rounded border border-border bg-card p-2 font-mono text-xs" placeholder="Paste an exported packet" /></label>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <label className="text-xs">Marketplace / channel<input className="mt-1 w-full rounded border border-border bg-card p-2" value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="Marketplace name" /></label>
      <label className="text-xs">Evidence<select className="mt-1 w-full rounded border border-border bg-card p-2" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="completed_sale">Completed sale</option><option value="active_asking">Active asking</option><option value="retail_offer">Retail offer</option></select></label>
      <label className="text-xs">Price<input inputMode="decimal" className="mt-1 w-full rounded border border-border bg-card p-2" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
      <label className="text-xs">Shipping<input inputMode="decimal" className="mt-1 w-full rounded border border-border bg-card p-2" value={shipping} onChange={(event) => setShipping(event.target.value)} /></label>
      <label className="text-xs">Currency<input maxLength={3} className="mt-1 w-full rounded border border-border bg-card p-2" value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
      <label className="text-xs">Citation URL<input type="url" className="mt-1 w-full rounded border border-border bg-card p-2" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
    </div>
    <label className="mt-3 block text-xs">Research notes<textarea className="mt-1 min-h-24 w-full rounded border border-border bg-card p-2" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Freeform notes; a comparable price is optional" /></label>
    <button type="button" disabled={busy} onClick={() => void submit()} className={`mt-3 ${buttonStyles()}`}>Save research</button>
    {message ? <p className="mt-2 text-sm text-muted-foreground" role="status">{message}</p> : null}
  </main>
}
