import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { buttonStyles } from '~/components/ui/button'
import { getPublicSession } from '~/features/auth/auth.functions'
import { parseResearchPacket } from '~/features/research/research.schemas'
import { previewResearchResult, type ResearchPreview } from '~/features/research/research.preview'
import { importPastedResearch, saveResearchPacket } from '~/features/research/research.functions'

export const Route = createFileRoute('/research/preview')({
  beforeLoad: async () => {
    if (!(await getPublicSession())) throw redirect({ to: '/login' })
  },
  head: () => ({ meta: [{ title: 'Research preview · Hoardcore' }] }),
  component: ResearchPreviewPage,
})

function DiagnosticList({ diagnostics }: { diagnostics: ResearchPreview['diagnostics'] }) {
  if (diagnostics.length === 0) return null
  return (
    <ul className="mt-3 space-y-2 text-sm text-destructive" aria-label="Validation diagnostics">
      {diagnostics.map((item, index) => (
        <li key={`${item.code}-${index}`}>
          <code>{item.code}</code> at <code>{item.path.join('.') || '(result)'}</code>: {item.message}
        </li>
      ))}
    </ul>
  )
}

function ResearchPreviewPage() {
  const [packetJson, setPacketJson] = useState('')
  const [resultJson, setResultJson] = useState('')
  const [preview, setPreview] = useState<ResearchPreview | undefined>()
  const [packetError, setPacketError] = useState<string | undefined>()
  const [importMessage, setImportMessage] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)

  function validatePreview() {
    setPacketError(undefined)
    try {
      const packet = parseResearchPacket(JSON.parse(packetJson))
      setPreview(previewResearchResult(resultJson, packet))
    } catch (error) {
      setPreview(undefined)
      setPacketError(error instanceof Error ? error.message : 'Packet JSON could not be parsed')
    }
  }

  async function confirmImport() {
    setBusy(true); setImportMessage(undefined)
    try {
      const packet = parseResearchPacket(JSON.parse(packetJson))
      await saveResearchPacket({ data: { packet } })
      const saved = await importPastedResearch({ data: { resultJson } })
      setImportMessage(`Imported ${saved.comparableCount} comparable${saved.comparableCount === 1 ? '' : 's'} (${saved.status}).`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Import failed')
    } finally { setBusy(false) }
  }

  return (
    <main className="w-full px-2 py-3 sm:px-3" id="main-content">
      <h1 className="text-base font-semibold text-foreground">Validate research</h1>

      <section className="mt-3 grid gap-3 lg:grid-cols-2" aria-label="Research JSON input">
        <label className="block">
          <span className="text-sm font-medium text-foreground">ResearchPacket JSON</span>
          <textarea
            value={packetJson}
            onChange={(event) => { setPacketJson(event.target.value); setPreview(undefined) }}
            className="mt-2 min-h-72 w-full rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
            placeholder="Paste the exported ResearchPacket JSON"
            spellCheck={false}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">ResearchResult JSON</span>
          <textarea
            value={resultJson}
            onChange={(event) => { setResultJson(event.target.value); setPreview(undefined) }}
            className="mt-2 min-h-72 w-full rounded-md border border-border bg-card p-3 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
            placeholder="Paste the structured ResearchResult JSON"
            spellCheck={false}
          />
        </label>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className={buttonStyles()} onClick={validatePreview}>Validate and preview</button>
        <button type="button" className={buttonStyles({ variant: 'secondary' })} disabled={busy || !preview || preview.status === 'invalid'} onClick={() => void confirmImport()}>Confirm import</button>
        {packetError ? <p className="text-sm text-destructive" role="alert">Packet: {packetError}</p> : null}
        {importMessage ? <p className="text-sm text-muted-foreground" role="status">{importMessage}</p> : null}
      </div>

      {preview ? (
        <section className="mt-8 rounded-lg border border-border bg-card p-5" aria-label="Research preview results">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">Preview: {preview.status}</h2>
            <p className="text-sm text-muted-foreground">{preview.records.length} result record(s) retained</p>
          </div>
          <DiagnosticList diagnostics={preview.diagnostics} />
          <div className="mt-5 space-y-4">
            {preview.records.map((item) => (
              <article key={item.index} className="rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-sm text-foreground">Record {item.index + 1}</h3>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{item.status}</span>
                </div>
                {item.record ? <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{item.record.reference.entityType}:{item.record.reference.hoardcoreId}</p> : <p className="mt-2 text-sm text-destructive">Record shape is invalid; retained for review.</p>}
                <DiagnosticList diagnostics={item.diagnostics} />
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
