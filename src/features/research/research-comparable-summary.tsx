export interface ResearchComparableSummaryItem {
  id: string
  channel: string
  evidenceType: 'active_asking' | 'completed_sale' | 'retail_offer'
  price: string
  shipping: string | null
  currency: string
  condition: string | null
  observedAt: Date | null
  soldAt: Date | null
  url: string | null
  notes: string | null
}

function label(value: ResearchComparableSummaryItem['evidenceType']) {
  return value === 'active_asking' ? 'Asking' : value === 'completed_sale' ? 'Sold' : 'Retail'
}

export function ResearchComparableSummary({ comparables }: { comparables: ResearchComparableSummaryItem[] }) {
  if (!comparables.length) return <section className="border-t border-border pt-3"><h2 className="text-sm font-medium">Research</h2><p className="mt-1 text-xs text-muted-foreground">No market comparables recorded.</p></section>
  return <section className="border-t border-border pt-3" aria-label="Research comparables">
    <div className="flex items-baseline justify-between gap-2"><h2 className="text-sm font-medium">Research</h2><span className="text-xs text-muted-foreground">{comparables.length} comparable{comparables.length === 1 ? '' : 's'}</span></div>
    <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="pr-3">Type</th><th className="pr-3">Channel</th><th className="pr-3">Price</th><th className="pr-3">Condition</th><th>Notes</th></tr></thead><tbody>{comparables.map((item) => <tr key={item.id} className="border-t border-border"><td className="py-1.5 pr-3">{label(item.evidenceType)}</td><td className="py-1.5 pr-3">{item.url ? <a className="text-primary underline" href={item.url} target="_blank" rel="noreferrer">{item.channel}</a> : item.channel}</td><td className="py-1.5 pr-3 tabular-nums">{item.price}{item.shipping ? ` + ${item.shipping}` : ''} {item.currency}</td><td className="py-1.5 pr-3">{item.condition ?? '—'}</td><td className="py-1.5 text-muted-foreground">{item.notes ?? '—'}</td></tr>)}</tbody></table></div>
  </section>
}
