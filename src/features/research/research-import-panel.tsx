import { useId, useRef, useState } from 'react'
import { buttonStyles } from '~/components/ui/button'
import { importPastedResearch, previewPastedResearch } from './research.functions'
import type { ResearchPreview } from './research.preview'
import { createResearchValidationTracker, researchValidationSummary } from './research-import-validation'

export function ResearchImportPanel({ packet }: { packet: unknown }) {
  const [resultJson, setResultJson] = useState('')
  const tracker = useRef(createResearchValidationTracker()).current
  const currentInput = useRef({ packet, resultJson })
  currentInput.current = { packet, resultJson }
  const [validated, setValidated] = useState<{ snapshot: ReturnType<typeof tracker.capture>; preview: ResearchPreview }>()
  const preview = validated && tracker.isCurrent(validated.snapshot, packet, resultJson) ? validated.preview : undefined
  const [message, setMessage] = useState<string>()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<'validate' | 'import'>()
  const inputId = useId()
  const diagnosticsId = `${inputId}-diagnostics`

  async function validate() {
    if (busy) return
    const snapshot = tracker.capture(packet, resultJson)
    setBusy('validate'); setValidated(undefined); setFailed(false); setMessage('Validating research…')
    try {
      const nextPreview = await previewPastedResearch({ data: { packet: snapshot.packet, resultJson: snapshot.resultJson } })
      if (!tracker.isCurrent(snapshot, currentInput.current.packet, currentInput.current.resultJson)) return
      setValidated({ snapshot, preview: nextPreview })
      setMessage(researchValidationSummary(nextPreview))
    } catch (error) {
      if (!tracker.isCurrent(snapshot, currentInput.current.packet, currentInput.current.resultJson)) return
      setFailed(true); setMessage(error instanceof Error ? error.message : 'Research JSON could not be validated. Try again.')
    }
    finally { setBusy(undefined) }
  }

  async function save() {
    if (busy || !validated || !preview || preview.status === 'invalid') return
    setBusy('import'); setFailed(false); setMessage('Importing research…')
    try {
      const saved = await importPastedResearch({ data: { resultJson: validated.snapshot.resultJson } })
      setMessage(`Imported ${saved.comparableCount} comparable${saved.comparableCount === 1 ? '' : 's'} as ${saved.status}.`)
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Research JSON could not be imported. Try again.') }
    finally { setBusy(undefined) }
  }

  return <section className="border-t border-border pt-3" aria-label="Import research">
    <div className="flex items-baseline justify-between gap-2"><h2 className="text-sm font-medium">Research import</h2>{preview ? <span className="text-xs text-muted-foreground">{preview.status}</span> : null}</div>
    <label htmlFor={inputId} className="mt-2 block text-xs font-medium">ResearchResult JSON</label>
    <textarea id={inputId} value={resultJson} disabled={busy === 'import'} aria-describedby={preview ? diagnosticsId : undefined} onChange={(event) => { tracker.invalidate(); currentInput.current = { packet, resultJson: event.target.value }; setResultJson(event.target.value); setValidated(undefined); setFailed(false); setMessage('Research changed. Validate again before importing.') }} spellCheck={false} className="mt-2 min-h-36 w-full rounded border border-border bg-card p-2 font-mono text-xs" placeholder="Paste a versioned ResearchResult JSON payload" />
    <div className="mt-2 flex gap-2"><button type="button" disabled={Boolean(busy) || !resultJson.trim()} className={buttonStyles({ size: 'small', variant: 'secondary' })} onClick={() => void validate()}>{busy === 'validate' ? 'Validating…' : 'Validate'}</button><button type="button" disabled={Boolean(busy) || !preview || preview.status === 'invalid'} className={buttonStyles({ size: 'small' })} onClick={() => void save()}>{busy === 'import' ? 'Importing…' : 'Import'}</button></div>
    {preview ? <div id={diagnosticsId} className="mt-2 text-xs">
      <h3 className="font-medium">Validation diagnostics</h3>
      {preview.diagnostics.length ? <ul className="mt-1 text-destructive">{preview.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>Result · {item.path.join('.') || 'result'}: {item.message}</li>)}</ul> : null}
      {preview.records.filter((record) => record.diagnostics.length > 0).map((record) => <div key={record.index} className="mt-2">
        <p className="break-all font-medium">Record {record.index + 1}{record.record ? ` · ${record.record.reference.entityType}:${record.record.reference.hoardcoreId}` : ''} · {record.status}</p>
        <ul className="mt-1 text-destructive">{record.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{item.path.join('.') || 'record'}: {item.message}</li>)}</ul>
      </div>)}
      {!preview.diagnostics.length && !preview.records.some((record) => record.diagnostics.length) ? <p>No diagnostics.</p> : null}
    </div> : null}
    <p className="mt-2 text-xs text-muted-foreground" role="status" aria-atomic="true">{!failed ? message : null}</p>
    <p className="mt-2 text-xs text-destructive" role="alert" aria-atomic="true">{failed ? message : null}</p>
  </section>
}
