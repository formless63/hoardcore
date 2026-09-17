import { createFileRoute, redirect } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
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
  const [message, setMessage] = useState<string>()
  const packet = useMemo(() => { try { return packetJson ? parseResearchPacket(JSON.parse(packetJson)) : undefined } catch { return undefined } }, [packetJson])
  const selectedRecord = packet?.records[selectedRecordIndex] ?? packet?.records[0]
  const selectedTitle = selectedRecord?.sourceFacts.find((fact) => fact.key === 'product.title')?.value
  useEffect(() => { if (exported) { setPacketJson(exported.packetJson); setSelectedRecordIndex(0) } }, [exported?.packet.packetId])

  const form = useForm({
    defaultValues: {
      channel: '', kind: 'completed_sale' as 'active_asking' | 'completed_sale' | 'retail_offer',
      price: '', shipping: '', currency: 'USD', url: '', notes: '',
    },
    onSubmit: async ({ value }) => {
      const comparable = validateManualComparable({ ...value, evidenceType: value.kind })
      if (!packet || !selectedRecord) { setMessage('Select a valid listing or paste a valid packet.'); return }
      if (comparable.status === 'invalid') { setMessage(comparable.message); return }
      if (!value.notes.trim() && comparable.status === 'empty') { setMessage('Add a note or a marketplace comparable.'); return }
      setMessage(undefined)
      try {
        await saveResearchPacket({ data: { packet } })
        const result = {
          resultVersion: packet.schemaVersion, packetVersion: packet.packetVersion, promptVersion: packet.promptVersion, schemaVersion: packet.schemaVersion,
          packetId: packet.packetId, resultId: `manual-${crypto.randomUUID()}`, completedAt: new Date().toISOString(),
          records: [{ reference: selectedRecord.reference, status: 'valid' as const, claims: value.notes.trim() ? [{ field: 'notes', value: value.notes.trim(), citationIds: [] }] : [], marketEstimates: [], risks: [], citations: value.url.trim() ? [{ citationId: 'manual-1', url: value.url.trim() }] : [], diagnostics: [], ...(comparable.status === 'valid' ? { comparables: [{ ...comparable.comparable, comparableId: 'manual-1', ...(value.url.trim() ? { citationId: 'manual-1' } : {}), ...(value.notes.trim() ? { notes: value.notes.trim() } : {}), observedAt: new Date().toISOString() }] } : {}) }],
        }
        const saved = await importPastedResearch({ data: { resultJson: JSON.stringify(result) } })
        setMessage(`Saved ${saved.comparableCount} manual comparable${saved.comparableCount === 1 ? '' : 's'}.`)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save manual research') }
    },
  })

  const fieldError = (field: { state: { meta: { isTouched: boolean; errors: unknown[] } }; name: string }) => field.state.meta.isTouched ? field.state.meta.errors[0] : undefined
  const comparableFields = ['channel', 'price', 'shipping', 'currency', 'url'] as const
  const hasComparableInput = (name: typeof comparableFields[number], value: string) => comparableFields.some((field) => field !== name && Boolean(field === 'channel' ? value : form.getFieldValue(field)))
  const validateField = (name: typeof comparableFields[number], value: string) => {
    const trimmed = value.trim()
    if (name === 'channel' && !trimmed && hasComparableInput(name, value)) return 'Enter a marketplace or channel.'
    if (name === 'price' && !trimmed && hasComparableInput(name, value)) return 'Enter a price.'
    if (name === 'currency' && hasComparableInput(name, value) && !/^[A-Za-z]{3}$/.test(trimmed)) return 'Use a three-letter currency code.'
    if (name === 'shipping' && trimmed && (!Number.isFinite(Number(trimmed)) || Number(trimmed) < 0)) return 'Shipping must be a non-negative number.'
    if (name === 'price' && trimmed && (!Number.isFinite(Number(trimmed)) || Number(trimmed) < 0)) return 'Price must be a non-negative number.'
    if (name === 'url' && trimmed) { try { if (!['http:', 'https:'].includes(new URL(trimmed).protocol)) throw new Error() } catch { return 'Citation URL must use HTTP or HTTPS.' } }
    return undefined
  }

  function ResearchField({ name, label, children }: { name: typeof comparableFields[number]; label: string; children: (field: any, error?: unknown) => React.ReactNode }) {
    return <form.Field name={name} validators={{ onChange: ({ value }) => validateField(name, value), onSubmit: ({ value }) => validateField(name, value) }}>{(field) => children(field, fieldError(field))}</form.Field>
  }

  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <h1 className="text-base font-semibold">Manual research</h1>
    <p className="mt-1 text-xs text-muted-foreground">Add market evidence or notes to a listing. Packet interchange is available below when needed.</p>
    {selectedRecord ? <div className="mt-3 rounded border border-border bg-card px-3 py-2 text-xs"><span className="text-muted-foreground">Researching </span><span className="font-medium text-foreground">{typeof selectedTitle === 'string' ? selectedTitle : selectedRecord.reference.hoardcoreId}</span></div> : null}
    {packet && packet.records.length > 1 ? <label className="mt-3 block text-xs">Choose packet item<select value={selectedRecordIndex} onChange={(event) => setSelectedRecordIndex(Number(event.target.value))} className="mt-1 h-8 w-full rounded border border-border bg-background px-2">{packet.records.map((record, index) => <option key={`${record.reference.hoardcoreId}-${index}`} value={index}>{String(record.sourceFacts.find((fact) => fact.key === 'product.title')?.value ?? record.reference.hoardcoreId)}</option>)}</select></label> : null}
    <details className="mt-3 text-xs" open={!exported}><summary className="cursor-pointer text-primary">ResearchPacket JSON · advanced</summary><label className="mt-2 block font-medium">Paste or inspect a packet<textarea value={packetJson} onChange={(event) => { setPacketJson(event.target.value); setSelectedRecordIndex(0) }} spellCheck={false} className="mt-1 min-h-32 w-full rounded border border-border bg-card p-2 font-mono text-xs" placeholder="Paste an exported packet" /></label></details>
    <form noValidate onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit() }}>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ResearchField name="channel" label="Marketplace / channel">{(field, error) => <label className="text-xs">Marketplace / channel<input aria-invalid={Boolean(error)} className="mt-1 w-full rounded border border-border bg-card p-2" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder="Marketplace name" />{error ? <span className="mt-1 block text-destructive">{String(error)}</span> : null}</label>}</ResearchField>
        <form.Field name="kind">{(field) => <label className="text-xs">Evidence<select className="mt-1 w-full rounded border border-border bg-card p-2" value={field.state.value} onChange={(event) => field.handleChange(event.target.value as typeof field.state.value)}><option value="completed_sale">Completed sale</option><option value="active_asking">Active asking</option><option value="retail_offer">Retail offer</option></select></label>}</form.Field>
        <ResearchField name="price" label="Price">{(field, error) => <label className="text-xs">Price<input inputMode="decimal" aria-invalid={Boolean(error)} className="mt-1 w-full rounded border border-border bg-card p-2" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />{error ? <span className="mt-1 block text-destructive">{String(error)}</span> : null}</label>}</ResearchField>
        <ResearchField name="shipping" label="Shipping">{(field, error) => <label className="text-xs">Shipping<input inputMode="decimal" aria-invalid={Boolean(error)} className="mt-1 w-full rounded border border-border bg-card p-2" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />{error ? <span className="mt-1 block text-destructive">{String(error)}</span> : null}</label>}</ResearchField>
        <ResearchField name="currency" label="Currency">{(field, error) => <label className="text-xs">Currency<input maxLength={3} aria-invalid={Boolean(error)} className="mt-1 w-full rounded border border-border bg-card p-2" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />{error ? <span className="mt-1 block text-destructive">{String(error)}</span> : null}</label>}</ResearchField>
        <ResearchField name="url" label="Citation URL">{(field, error) => <label className="text-xs">Citation URL<input type="url" aria-invalid={Boolean(error)} className="mt-1 w-full rounded border border-border bg-card p-2" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />{error ? <span className="mt-1 block text-destructive">{String(error)}</span> : null}</label>}</ResearchField>
      </div>
      <form.Field name="notes">{(field) => <label className="mt-3 block text-xs">Research notes<textarea className="mt-1 min-h-24 w-full rounded border border-border bg-card p-2" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} placeholder="Freeform notes; a comparable price is optional" /></label>}</form.Field>
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>{([canSubmit, isSubmitting]) => <button type="submit" disabled={!canSubmit || isSubmitting} className={`mt-3 ${buttonStyles()}`}>{isSubmitting ? 'Saving…' : 'Save research'}</button>}</form.Subscribe>
    </form>
    {message ? <p className="mt-2 text-sm text-muted-foreground" role="status">{message}</p> : null}
  </main>
}
