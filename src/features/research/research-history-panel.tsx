import { parseResearchResult, type ResearchResult } from './research.schemas'

export interface ResearchHistoryItem {
  id: string
  status: 'valid' | 'partial' | 'invalid'
  resultId: string
  completedAt: Date | null
  createdAt: Date
  rawPayload: string
  normalizedPayload: unknown
}

function parsed(value: unknown): ResearchResult | undefined {
  try { return parseResearchResult(typeof value === 'string' ? JSON.parse(value) : value) } catch { return undefined }
}

export function ResearchHistoryPanel({ history }: { history: ResearchHistoryItem[] }) {
  if (!history.length) return <section className="border-t border-border pt-3"><h2 className="text-sm font-medium">Research history</h2><p className="mt-1 text-xs text-muted-foreground">No imported research or notes recorded.</p></section>
  return <section className="border-t border-border pt-3" aria-label="Research history">
    <div className="flex items-baseline justify-between gap-2"><h2 className="text-sm font-medium">Research history</h2><span className="text-xs text-muted-foreground">{history.length} submission{history.length === 1 ? '' : 's'}</span></div>
    <div className="mt-2 space-y-2">{history.map((item) => {
      const result = parsed(item.normalizedPayload)
      const claims = result?.records.flatMap((record) => record.claims) ?? []
      const citations = result?.records.flatMap((record) => record.citations) ?? []
      return <details key={item.id} className="border border-border px-2 py-1.5 text-xs">
        <summary className="cursor-pointer select-none text-foreground"><span className="font-mono">{item.resultId}</span><span className="ml-2 text-muted-foreground">{item.status} · {(item.completedAt ?? item.createdAt).toLocaleString()}</span></summary>
        {claims.length ? <dl className="mt-2 grid gap-1">{claims.map((claim, index) => <div key={`${claim.field}-${index}`}><dt className="inline text-muted-foreground">{claim.field}: </dt><dd className="inline break-words">{typeof claim.value === 'string' ? claim.value : JSON.stringify(claim.value)}</dd></div>)}</dl> : <p className="mt-2 text-muted-foreground">No normalized claims.</p>}
        {citations.length ? <ul className="mt-2 space-y-1 text-muted-foreground">{citations.map((citation) => <li key={citation.citationId}><a className="text-primary underline" href={citation.url} target="_blank" rel="noreferrer">{citation.title ?? citation.url}</a>{citation.excerpt ? ` — ${citation.excerpt}` : ''}</li>)}</ul> : null}
        <details className="mt-2"><summary className="cursor-pointer text-muted-foreground">Raw payload / provenance</summary><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 text-[11px] text-foreground">{item.rawPayload}</pre></details>
      </details>
    })}</div>
  </section>
}
