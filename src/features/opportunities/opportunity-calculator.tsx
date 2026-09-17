import { useState } from 'react'
import { calculateOpportunity } from './calculate'

function parseAmount(value: string) { return value.trim() === '' ? 0 : Number(value) }

export function OpportunityCalculator({ price, currency }: { price: string | null; currency: string | null }) {
  const [resale, setResale] = useState('')
  const [feePercent, setFeePercent] = useState('')
  const [shipping, setShipping] = useState('')
  const [otherCosts, setOtherCosts] = useState('')
  const acquisition = price === null ? NaN : Number(price)
  const result = resale.trim() ? calculateOpportunity({ acquisition, resale: parseAmount(resale), feePercent: parseAmount(feePercent), shipping: parseAmount(shipping), otherCosts: parseAmount(otherCosts) }) : null
  const money = (value: number) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency ?? 'USD' }).format(value) }
    catch { return value.toFixed(2) }
  }
  return <section className="mt-4 border-t border-border pt-3" aria-label="Opportunity calculator">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-medium">Quick margin check</h2><span className="text-[11px] text-muted-foreground">Local estimate · not saved</span></div>
    <p className="mt-1 text-xs text-muted-foreground">At the current source price of {price === null ? 'unknown' : money(acquisition)}, test a resale scenario. Taxes and unentered costs are excluded.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-4">{[
      { label: 'Resale price', value: resale, set: setResale },
      { label: 'Marketplace fee %', value: feePercent, set: setFeePercent },
      { label: 'Shipping', value: shipping, set: setShipping },
      { label: 'Other costs', value: otherCosts, set: setOtherCosts },
    ].map((field) => <label key={field.label} className="text-[11px] text-muted-foreground">{field.label}<input type="number" min="0" step="0.01" inputMode="decimal" value={field.value} onChange={(event) => field.set(event.target.value)} className="mt-1 h-8 w-full rounded border border-border bg-background px-2 text-xs tabular-nums text-foreground" /></label>)}</div>
    {resale.trim() && !result ? <p className="mt-2 text-xs text-destructive">Enter nonnegative amounts with at most two decimals, a fee at or below 100%, and use a listing with a known source price.</p> : null}
    {result ? <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-border pt-2 text-xs" aria-live="polite"><span>Fees <strong className="font-mono text-foreground">{money(result.fees)}</strong></span><span>Total cost <strong className="font-mono text-foreground">{money(result.totalCost)}</strong></span><span>Estimated profit <strong className={`font-mono ${result.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{money(result.profit)}</strong></span><span>ROI on source price <strong className="font-mono text-foreground">{result.roiPercent === null ? '—' : `${result.roiPercent.toFixed(1)}%`}</strong></span></div> : null}
  </section>
}
