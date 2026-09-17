import { Await, createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getListingDetail, getListingEvidencePayload } from '~/features/catalog/listing-detail.functions'
import type { ListingDetail } from '~/features/catalog/listing-detail.schemas'
import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { ListingDetailPending, ListingLoadError } from '~/features/catalog/listing-load-state'
import { CachedListingImage } from '~/features/media/cached-listing-image'
import { listListingResearchComparables, listListingResearchHistory } from '~/features/research/research.functions'
import { ResearchComparableSummary } from '~/features/research/research-comparable-summary'
import { ResearchHistoryPanel } from '~/features/research/research-history-panel'
import { listWatchedListingIds } from '~/features/watchlist/watchlist.functions'
import { WatchButton } from '~/features/watchlist/watch-button'
import { stockLabel } from '~/features/catalog/stock-label'
import { ListingTrends } from '~/features/catalog/listing-trend-panel'
import { OpportunityCalculator } from '~/features/opportunities/opportunity-calculator'
import { getCurrentListingDecision } from '~/features/catalog/listing-decisions.functions'
import { ListingDecisionControl } from '~/features/catalog/listing-decision-control'

export const Route = createFileRoute('/listings/$listingId')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: async ({ params }) => {
    const detail = await getListingDetail({ data: { listingId: params.listingId } })
    const supplement = Promise.all([
      listListingResearchComparables({ data: { listingId: params.listingId } }),
      listListingResearchHistory({ data: { listingId: params.listingId } }),
      listWatchedListingIds(),
      getCurrentListingDecision({ data: { listingId: params.listingId } }),
    ]).then(([comparables, history, watchedListingIds, decision]) => ({ comparables, history, watched: watchedListingIds.includes(params.listingId), decision }))
    return { detail, supplement }
  },
  head: () => ({ meta: [{ title: 'Listing detail · Hoardcore' }] }),
  pendingMs: 100,
  pendingMinMs: 200,
  pendingComponent: ListingDetailPending,
  errorComponent: ListingLoadError,
  component: ListingDetailPage,
})

function money(value: string | null, currency: string | null) {
  if (value === null) return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return currency ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) : amount.toFixed(2)
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="break-all text-foreground">{value}</dd></div>
}

function Observation({ listingId, observation }: { listingId: string; observation: ListingDetail['observations'][number] }) {
  const getEvidence = useServerFn(getListingEvidencePayload)
  const [payload, setPayload] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const evidenceId = observation.evidence?.id
  async function loadEvidence() {
    if (!evidenceId || loading || payload !== null) return
    setLoading(true)
    setError(false)
    try {
      const result = await getEvidence({ data: { listingId, evidenceId } })
      if (result === null) setError(true)
      else setPayload(result)
    } catch { setError(true) }
    finally { setLoading(false) }
  }
  return <article className="border-t border-border py-2 text-xs">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <time dateTime={observation.observedAt.toISOString()} className="text-muted-foreground">{observation.observedAt.toLocaleString()}</time>
      <span>{money(observation.price, observation.currency)}</span>
      {observation.compareAtPrice && Number(observation.compareAtPrice) > Number(observation.price ?? 0) ? <span className="text-muted-foreground line-through">{money(observation.compareAtPrice, observation.currency)}</span> : null}
      <span>{stockLabel(observation.available, observation.stockQuantity)}</span><span className="truncate">{observation.title}</span>
    </div>
    {observation.evidence ? <details className="mt-1" onToggle={(event) => { if (event.currentTarget.open) void loadEvidence() }}><summary className="cursor-pointer text-primary">Captured evidence</summary><p className="mt-1 text-muted-foreground">Evidence {observation.evidence.id}{observation.evidence.run ? ` · run ${observation.evidence.run.id} · ${observation.evidence.run.status}` : ''}</p>{loading ? <div aria-live="polite" className="mt-2 animate-pulse rounded bg-muted p-2 motion-reduce:animate-none">Loading captured evidence…</div> : null}{error ? <button type="button" className="mt-2 text-primary underline" onClick={() => void loadEvidence()}>Could not load evidence. Retry</button> : null}{payload !== null ? <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs text-foreground">{payload}</pre> : null}</details> : null}
  </article>
}

function ListingDetailPage() {
  const { detail, supplement } = Route.useLoaderData()
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null)
  if (!detail) return <main className="w-full px-2 py-3" id="main-content"><Link className="text-xs text-primary underline" to="/listings">← Listings</Link><p className="mt-3 text-sm">Listing not found.</p></main>
  const media = detail.mediaCaptures
  const activeMediaId = media.some((item) => item.id === selectedMediaId) ? selectedMediaId : media[0]?.id
  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <div className="flex flex-wrap items-center justify-between gap-2"><Link to="/listings" className="text-xs text-primary underline">← Listings</Link><div className="flex items-center gap-3"><Await promise={supplement} fallback={<span className="h-6 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />}>{({ watched }) => <WatchButton listingId={detail.id} initialWatched={watched} />}</Await><Link to="/research/manual" search={{ listingId: detail.id }} className="text-xs text-primary underline">Add research</Link><a href={detail.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open source listing ↗</a></div></div>
    <div className="mt-3 flex flex-wrap gap-4">
      <div className="w-72 max-w-full shrink-0" aria-label="Captured product images"><CachedListingImage captureId={activeMediaId} variant="preview" alt={detail.product.title} className="flex size-72 max-w-full items-center justify-center rounded border border-border bg-card object-contain text-xs text-muted-foreground" />{media.length > 1 ? <div className="mt-1 flex flex-wrap gap-1">{media.map((item, index) => <button key={item.id} type="button" aria-label={`Show captured image ${index + 1}`} aria-pressed={activeMediaId === item.id} onClick={() => setSelectedMediaId(item.id)} className="rounded border border-border aria-pressed:ring-2 aria-pressed:ring-ring"><CachedListingImage captureId={item.id} alt="" className="size-12 object-contain" /></button>)}</div> : null}</div>
      <div className="min-w-0 flex-1"><h1 className="text-lg font-medium text-foreground">{detail.product.title}</h1><p className="mt-1 text-xs text-muted-foreground">{detail.source.displayName}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4 lg:grid-cols-7"><Field label="Manufacturer" value={detail.product.brand ?? '—'} /><Field label="Category" value={detail.product.productType ?? '—'} /><Field label="SKU" value={detail.variant.sku ?? '—'} /><Field label="Price" value={money(detail.current.price, detail.current.currency)} /><Field label="Was" value={detail.current.compareAtPrice && Number(detail.current.compareAtPrice) > Number(detail.current.price ?? 0) ? money(detail.current.compareAtPrice, detail.current.currency) : '—'} /><Field label="Stock" value={stockLabel(detail.current.available, detail.current.stockQuantity)} /><Field label="Observed" value={detail.current.observedAt.toLocaleString()} />{detail.variant.title && detail.variant.title !== 'Default Title' ? <Field label="Variant" value={detail.variant.title} /> : null}</dl>
        {detail.product.tags.length ? <p className="mt-3 text-xs text-muted-foreground">Tags: {detail.product.tags.join(', ')}</p> : null}
      </div>
    </div>
    {detail.product.description ? <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">{detail.product.description}</p> : null}
    <ListingTrends detail={detail} />
    <OpportunityCalculator price={detail.current.price} currency={detail.current.currency} />
    <Await promise={supplement} fallback={null}>{({ decision }) => <ListingDecisionControl listingId={detail.id} initial={decision} />}</Await>
    <Await promise={supplement} fallback={<div aria-label="Loading research" className="mt-4 space-y-2"><div className="h-12 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="h-12 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>}>{({ comparables, history }) => <><ResearchComparableSummary comparables={comparables} /><ResearchHistoryPanel history={history} /></>}</Await>
    <section className="mt-5" aria-label="Listing observations and evidence"><h2 className="text-sm font-medium text-foreground">Observation history ({detail.observations.length})</h2>{detail.observations.length ? <div className="mt-2">{detail.observations.map((observation) => <Observation key={observation.id} listingId={detail.id} observation={observation} />)}</div> : <p className="mt-2 text-xs text-muted-foreground">No observations recorded yet.</p>}</section>
  </main>
}
