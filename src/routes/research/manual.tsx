import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { buttonStyles } from '~/components/ui/button'
import { getPublicSession } from '~/features/auth/auth.functions'
import { importPastedResearch, saveResearchPacket } from '~/features/research/research.functions'
import { parseResearchPacket } from '~/features/research/research.schemas'
import { createResearchExport } from '~/features/catalog/catalog.functions'
import { validateManualComparable } from '~/features/research/manual-comparable'
import { z } from 'zod'

export const Route = createFileRoute('/research/manual')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  validateSearch: z.object({ listingId: z.uuid().optional() }),
  loaderDeps: ({ search }) => ({ listingId: search.listingId }),
  loader: async ({ deps }) => deps.listingId ? createResearchExport({ data: { listingIds: [deps.listingId], persist: false } }) : null,
  head: () => ({ meta: [{ title: 'Manual research · Hoardcore' }] }),
  component: ManualResearchPage,
})

function ManualResearchPage() {
  const exported = Route.useLoaderData()
  const [packetJson, setPacketJson] = useState(() => exported ? exported.packetJson : '')
  const [selectedRecordIndex, setSelectedRecordIndex] = useState(0)
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
  const selectedRecord = packet?.records[selectedRecordIndex] ?? packet?.records[0]
  const selectedTitle = selectedRecord?.sourceFacts.find((fact) => fact.key === 'product.title')?.value
  useEffect(() => { if (exported) { setPacketJson(exported.packetJson); setSelectedRecordIndex(0) } }, [exported?.packet.packetId])

  async function submit() {
    const comparable = validateManualComparable({ channel, evidenceType: kind, price, shipping, currency, url })
    if (!packet || !selectedRecord) { setMessage('Select a valid listing or paste a valid packet.'); return }
    if (comparable.status === 'invalid') { setMessage(comparable.message); return }
    if (!notes.trim() && comparable.status === 'empty') { setMessage('Add a note or a marketplace comparable.'); return }
    if (url.trim()) {
      try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error() }
      catch { setMessage('Citation URL must be a valid HTTP or HTTPS address.'); return }
    }
    setBusy(true); setMessage(undefined)
    try {
      await saveResearchPacket({ data: { packet } })
      const result = {
        resultVersion: packet.schemaVersion, packetVersion: packet.packetVersion, promptVersion: packet.promptVersion, schemaVersion: packet.schemaVersion,
        packetId: packet.packetId, resultId: `manual-${crypto.randomUUID()}`, completedAt: new Date().toISOString(),
        records: [{ reference: selectedRecord.reference, status: 'valid' as const, claims: notes.trim() ? [{ field: 'notes', value: notes.trim(), citationIds: [] }] : [], marketEstimates: [], risks: [], citations: url.trim() ? [{ citationId: 'manual-1', url: url.trim() }] : [], diagnostics: [], ...(comparable.status === 'valid' ? { comparables: [{ ...comparable.comparable, comparableId: 'manual-1', ...(url.trim() ? { citationId: 'manual-1' } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), observedAt: new Date().toISOString() }] } : {}) }],
      }
      const saved = await importPastedResearch({ data: { resultJson: JSON.stringify(result) } })
      setMessage(`Saved ${saved.comparableCount} manual comparable${saved.comparableCount === 1 ? '' : 's'}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save manual research') }
    finally { setBusy(false) }
  }

  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <h1 className="text-base font-semibold">Manual research</h1>
    <p className="mt-1 text-xs text-muted-foreground">Add market evidence or notes to a listing. Packet interchange is available below when needed.</p>
    {selectedRecord ? <div className="mt-3 rounded border border-border bg-card px-3 py-2 text-xs"><span className="text-muted-foreground">Researching </span><span className="font-medium text-foreground">{typeof selectedTitle === 'string' ? selectedTitle : selectedRecord.reference.hoardcoreId}</span></div> : null}
    {packet && packet.records.length > 1 ? <label className="mt-3 block text-xs">Choose packet item<select value={selectedRecordIndex} onChange={(event) => setSelectedRecordIndex(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-border bg-background px-2">{packet.records.map((record, index) => <option key={`${record.reference.hoardcoreId}-${index}`} value={index}>{String(record.sourceFacts.find((fact) => fact.key === 'product.title')?.value ?? record.reference.hoardcoreId)}</option>)}</select></label> : null}
    <details className="mt-3 text-xs" open={!exported}><summary className="cursor-pointer text-primary">ResearchPacket JSON · advanced</summary><label className="mt-2 block font-medium">Paste or inspect a packet<textarea value={packetJson} onChange={(event) => { setPacketJson(event.target.value); setSelectedRecordIndex(0) }} spellCheck={false} className="mt-1 min-h-32 w-full rounded border border-border bg-card p-2 font-mono text-xs" placeholder="Paste an exported packet" /></label></details>
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
