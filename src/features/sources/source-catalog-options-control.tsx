import { useServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { updateSourceCatalogOptions } from './sources.functions'
import type { CatalogSourceSummary } from './sources.schemas'

export function SourceCatalogOptionsControl({ source, onSaved }: { source: CatalogSourceSummary; onSaved: (source: CatalogSourceSummary) => void }) {
  const update = useServerFn(updateSourceCatalogOptions)
  const [currency, setCurrency] = useState(source.currency ?? '')
  const [stockCardsEnabled, setStockCardsEnabled] = useState(source.stockCardsEnabled)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setCurrency(source.currency ?? ''); setStockCardsEnabled(source.stockCardsEnabled) }, [source.currency, source.stockCardsEnabled])
  async function save() {
    setBusy(true); setMessage('')
    try { onSaved(await update({ data: { sourceId: source.id, currency, stockCardsEnabled } })); setMessage('Saved') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save catalog options') }
    finally { setBusy(false) }
  }
  return <details className="mt-3 rounded border border-border p-3 text-xs"><summary className="cursor-pointer font-medium">Catalog options</summary><div className="mt-2 flex flex-wrap items-end gap-2"><label className="text-muted-foreground">Currency<input aria-label={`Currency for ${source.displayName}`} maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className="mt-1 h-8 w-16 rounded border border-border bg-background px-1.5 uppercase text-foreground" placeholder="—" /></label><label className="flex items-center gap-1 text-muted-foreground"><input type="checkbox" checked={stockCardsEnabled} onChange={(event) => setStockCardsEnabled(event.target.checked)} /> Enable stock-card supplement</label><Button size="small" disabled={busy || Boolean(currency) && !/^[A-Z]{3}$/.test(currency)} onClick={() => void save()}>{busy ? 'Saving…' : 'Save options'}</Button></div>{stockCardsEnabled ? <p className="mt-2 text-muted-foreground">Stock-card mode may use roughly two requests per page (JSON plus HTML). Set a sufficient finite request ceiling before collecting.</p> : null}{message ? <p className="mt-2" role="status">{message}</p> : null}</details>
}
