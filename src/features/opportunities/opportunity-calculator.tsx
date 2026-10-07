import { useEffect, useReducer, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { calculateOpportunity } from './calculate'
import { getCurrentOpportunityAssumptions, saveCurrentOpportunityAssumptions } from './opportunity.functions'
import type { OpportunityInputsWithProvenance } from './opportunity.schemas'
import { calculatorDraftReducer, canSaveCalculatorDraft, createCalculatorDraft } from './opportunity-calculator-hydration'

const labels: Record<keyof OpportunityInputsWithProvenance, string> = { quantity: 'Quantity', acquisitionCost: 'Acquisition / unit', estimatedMarketValue: 'Market value / unit', platformFeePercent: 'Platform fee %', paymentFeePercent: 'Payment fee %', shipping: 'Shipping', tax: 'Tax', handling: 'Handling', otherCosts: 'Other costs', downsidePercent: 'Downside %' }
const percentKeys = new Set<keyof OpportunityInputsWithProvenance>(['platformFeePercent', 'paymentFeePercent', 'downsidePercent'])
function defaults(price: string | null): OpportunityInputsWithProvenance { const acquisition = price !== null && Number.isFinite(Number(price)) ? Number(price) : null; const source = (kind: 'listing_observation' | 'operator_override' = 'operator_override') => ({ kind }); return { quantity: { value: 1, provenance: source() }, acquisitionCost: { value: acquisition, provenance: source(acquisition === null ? 'operator_override' : 'listing_observation') }, estimatedMarketValue: { value: null, provenance: source() }, platformFeePercent: { value: 0, provenance: source() }, paymentFeePercent: { value: 0, provenance: source() }, shipping: { value: 0, provenance: source() }, tax: { value: 0, provenance: source() }, handling: { value: 0, provenance: source() }, otherCosts: { value: 0, provenance: source() }, downsidePercent: { value: 0, provenance: source() } } }
function values(inputs: OpportunityInputsWithProvenance) { return { quantity: inputs.quantity.value, acquisitionCost: inputs.acquisitionCost.value, estimatedMarketValue: inputs.estimatedMarketValue.value, platformFeePercent: inputs.platformFeePercent.value, paymentFeePercent: inputs.paymentFeePercent.value, shipping: inputs.shipping.value, tax: inputs.tax.value, handling: inputs.handling.value, otherCosts: inputs.otherCosts.value, downsidePercent: inputs.downsidePercent.value } }

export function OpportunityCalculator({ listingId, price, currency }: { listingId?: string; price: string | null; currency: string | null }) {
  return <ListingOpportunityCalculator key={listingId ?? 'standalone'} listingId={listingId} price={price} currency={currency} />
}

function ListingOpportunityCalculator({ listingId, price, currency }: { listingId?: string; price: string | null; currency: string | null }) {
  const load = useServerFn(getCurrentOpportunityAssumptions)
  const save = useServerFn(saveCurrentOpportunityAssumptions)
  const [draft, dispatch] = useReducer(calculatorDraftReducer, undefined, () => createCalculatorDraft(defaults(price), currency, Boolean(listingId)))
  const { inputs, currency: scenarioCurrency } = draft
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  useEffect(() => {
    if (!listingId) return
    let live = true
    dispatch({ type: 'load-start' })
    void load({ data: { listingId } }).then((saved) => {
      if (live) dispatch({ type: 'loaded', saved })
    }).catch(() => {
      if (live) dispatch({ type: 'load-error' })
    })
    return () => { live = false }
  }, [listingId, load, loadAttempt])
  const result = calculateOpportunity(values(inputs)); const money = (value: number) => { if (!scenarioCurrency) return value.toFixed(2); try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: scenarioCurrency }).format(value) } catch { return `${value.toFixed(2)} ${scenarioCurrency}` } }
  function clearFeedback() { setMessage(''); setSaveError('') }
  function update(key: keyof OpportunityInputsWithProvenance, raw: string) { clearFeedback(); dispatch({ type: 'value', key, value: raw.trim() ? Number(raw) : null }) }
  function source(key: keyof OpportunityInputsWithProvenance, kind: 'listing_observation' | 'research_comparable' | 'operator_override') { clearFeedback(); dispatch({ type: 'source', key, kind }) }
  function changeCurrency(raw: string) { clearFeedback(); dispatch({ type: 'currency', currency: raw.trim() ? raw.toUpperCase() : null }) }
  async function persist() {
    if (busy || !canSaveCalculatorDraft(draft)) return
    if (!listingId) { setMessage('Open this calculator from a listing to save assumptions.'); return }
    setBusy(true); clearFeedback()
    try { await save({ data: { listingId, currency: scenarioCurrency, inputs } }); setMessage('Assumptions saved.') }
    catch { setSaveError('Could not save assumptions. Your edits are kept. Try Save assumptions again.') }
    finally { setBusy(false) }
  }
  return <section className="mt-4 border-t border-border pt-3" aria-label="Opportunity calculator"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-medium">Opportunity scenario</h2><button type="button" disabled={busy || !canSaveCalculatorDraft(draft)} onClick={() => void persist()} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save assumptions'}</button></div><p className="mt-1 text-xs text-muted-foreground">A single-currency scenario; every input keeps an explicit source or operator override.</p>{draft.loadStatus === 'loading' ? <p className="mt-2 text-xs text-muted-foreground" role="status">Loading saved assumptions. You can edit while they load.</p> : null}{draft.loadStatus === 'error' ? <p className="mt-2 text-xs text-destructive" role="alert">Could not load saved assumptions. Your edits are kept; retry loading before saving. <button type="button" className="text-primary underline" onClick={() => { dispatch({ type: 'load-start' }); setLoadAttempt((attempt) => attempt + 1) }}>Retry loading</button></p> : null}<label className="mt-2 block text-[11px] text-muted-foreground">Scenario currency <input value={scenarioCurrency ?? ''} maxLength={3} placeholder="Unknown" onChange={(event) => changeCurrency(event.target.value)} className="h-8 w-20 rounded border border-border bg-background px-2 text-xs uppercase text-foreground" /></label><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(labels) as Array<keyof OpportunityInputsWithProvenance>).map((key) => <div key={key} className="rounded border border-border p-2"><label className="block text-[11px] text-muted-foreground">{labels[key]}<input type="number" min="0" step={key === 'quantity' ? '1' : percentKeys.has(key) ? '0.0001' : '0.01'} value={inputs[key].value ?? ''} onChange={(event) => update(key, event.target.value)} className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs tabular-nums text-foreground" /></label><label className="mt-1 block text-[10px] text-muted-foreground">Source <select value={inputs[key].provenance.kind} onChange={(event) => source(key, event.target.value as 'listing_observation' | 'research_comparable' | 'operator_override')} className="rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground"><option value="operator_override">Operator override</option><option value="listing_observation">Listing observation</option><option value="research_comparable">Research comparable</option></select></label></div>)}</div>{result.status === 'incomplete' ? <p className="mt-2 text-xs text-muted-foreground">Enter: {result.missing.map((key) => labels[key]).join(', ')}.</p> : null}{result.status === 'invalid' ? <p className="mt-2 text-xs text-destructive">Use nonnegative amounts, valid percentages, and a positive whole quantity.</p> : null}{result.status === 'complete' ? <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2 text-xs" aria-live="polite"><span>Revenue <strong>{money(result.grossRevenue)}</strong></span><span>Fees <strong>{money(result.totalFees)}</strong></span><span>Cost <strong>{money(result.totalCost)}</strong></span><span>Profit <strong className={result.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{money(result.profit)}</strong></span><span>ROI <strong>{result.roiPercent === null ? '—' : `${result.roiPercent.toFixed(1)}%`}</strong></span><span>Margin <strong>{result.marginPercent === null ? '—' : `${result.marginPercent.toFixed(1)}%`}</strong></span><span>Break-even / unit <strong>{result.breakEvenUnitPrice === null ? '—' : money(result.breakEvenUnitPrice)}</strong></span><span>Downside profit <strong>{money(result.downsideProfit)}</strong></span></div> : null}{saveError ? <p className="mt-2 text-xs text-destructive" role="alert">{saveError}</p> : null}{message ? <p className="mt-2 text-xs text-muted-foreground" role="status">{message}</p> : null}</section>
}
