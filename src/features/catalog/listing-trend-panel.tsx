import type { ListingDetail } from './listing-detail.schemas'
import { listingTrendPoints, trendPolyline } from './listing-trends'

function Trend({ label, values, formatter }: { label: string; values: number[]; formatter: (value: number) => string }) {
  const first = values[0]
  const latest = values.at(-1)
  const delta = first === undefined || latest === undefined ? null : latest - first
  return <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0">
    <div className="flex items-baseline justify-between gap-2"><h3 className="text-[11px] font-medium uppercase tracking-[.12em] text-muted-foreground">{label}</h3><span className="font-mono text-sm tabular-nums text-foreground">{latest === undefined ? '—' : formatter(latest)}</span></div>
    <div className="mt-2 flex h-16 items-center">{values.length >= 2 ? <svg className="h-16 w-full overflow-visible text-primary" viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label={`${label}: ${values.map(formatter).join(' to ')}`}><polyline points={trendPolyline(values)} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg> : <span className="text-xs text-muted-foreground">Need another observation for a trend</span>}</div>
    <p className="mt-1 text-[11px] text-muted-foreground">{delta === null ? 'No known values' : `${values.length} observations · ${delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : '−'}${formatter(Math.abs(delta))}`}`}</p>
  </div>
}

export function ListingTrends({ detail }: { detail: ListingDetail }) {
  const prices = listingTrendPoints(detail.observations, 'price').map((point) => point.value)
  const quantities = listingTrendPoints(detail.observations, 'stockQuantity').map((point) => point.value)
  if (!prices.length && !quantities.length) return null
  const currency = detail.current.currency ?? 'USD'
  const money = (value: number) => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value) }
    catch { return value.toFixed(2) }
  }
  return <section className="mt-4 border-y border-border py-3" aria-label="Listing trends">
    <div className="mb-3 flex items-baseline justify-between"><h2 className="text-sm font-medium">Trend</h2><span className="text-[11px] text-muted-foreground">Latest 80 observations</span></div>
    <div className="grid gap-3 sm:grid-cols-2"><Trend label="Source price" values={prices} formatter={money} /><Trend label="Reported stock" values={quantities} formatter={(value) => value.toLocaleString()} /></div>
  </section>
}
