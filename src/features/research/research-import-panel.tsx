import { useState } from 'react'
import { buttonStyles } from '~/components/ui/button'
import { importPastedResearch, previewPastedResearch } from './research.functions'
import type { ResearchPreview } from './research.preview'

export function ResearchImportPanel({ packet }: { packet: unknown }) {
  const [resultJson, setResultJson] = useState('')
  const [preview, setPreview] = useState<ResearchPreview>()
  const [message, setMessage] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function validate() {
    setBusy(true); setMessage(undefined)
    try {
      setPreview(await previewPastedResearch({ data: { packet, resultJson } }))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Research JSON could not be validated') }
    finally { setBusy(false) }
  }

  async function save() {
    setBusy(true); setMessage(undefined)
    try {
      const saved = await importPastedResearch({ data: { resultJson } })
      setMessage(`Imported ${saved.comparableCount} comparable${saved.comparableCount === 1 ? '' : 's'} as ${saved.status}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Research JSON could not be imported') }
    finally { setBusy(false) }
  }

  return <section className="border-t border-border pt-3" aria-label="Import research">
    <div className="flex items-baseline justify-between gap-2"><h2 className="text-sm font-medium">Research import</h2>{preview ? <span className="text-xs text-muted-foreground">{preview.status}</span> : null}</div>
    <textarea value={resultJson} onChange={(event) => { setResultJson(event.target.value); setPreview(undefined); setMessage(undefined) }} spellCheck={false} className="mt-2 min-h-36 w-full rounded border border-border bg-card p-2 font-mono text-xs" placeholder="Paste a versioned ResearchResult JSON payload" />
    <div className="mt-2 flex gap-2"><button type="button" disabled={busy || !resultJson.trim()} className={buttonStyles({ size: 'small', variant: 'secondary' })} onClick={() => void validate()}>Validate</button><button type="button" disabled={busy || !preview || preview.status === 'invalid'} className={buttonStyles({ size: 'small' })} onClick={() => void save()}>Import</button></div>
    {preview?.diagnostics.length ? <ul className="mt-2 text-xs text-destructive">{preview.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{item.path.join('.') || 'result'}: {item.message}</li>)}</ul> : null}
    {message ? <p className="mt-2 text-xs text-muted-foreground" role="status">{message}</p> : null}
  </section>
}
