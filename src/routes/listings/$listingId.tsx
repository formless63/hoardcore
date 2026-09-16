import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getListingDetail } from '~/features/catalog/listing-detail.functions'
import type { ListingDetail } from '~/features/catalog/listing-detail.schemas'

export const Route = createFileRoute('/listings/$listingId')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: ({ params }) => getListingDetail({ data: { listingId: params.listingId } }),
  head: () => ({ meta: [{ title: 'Listing detail · Hoardcore' }] }),
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

function Observation({ observation }: { observation: ListingDetail['observations'][number] }) {
  return <article className="border-t border-border py-2 text-xs">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <time dateTime={observation.observedAt.toISOString()} className="text-muted-foreground">{observation.observedAt.toLocaleString()}</time>
      <span>{money(observation.price, observation.currency)}</span>
      {observation.compareAtPrice && Number(observation.compareAtPrice) > Number(observation.price ?? 0) ? <span className="text-muted-foreground line-through">{money(observation.compareAtPrice, observation.currency)}</span> : null}
      <span>{observation.available ? 'In stock' : 'Out'}</span><span className="truncate">{observation.title}</span>
    </div>
    {observation.evidence ? <details className="mt-1"><summary className="cursor-pointer text-primary">Captured evidence</summary><p className="mt-1 text-muted-foreground">Evidence {observation.evidence.id}{observation.evidence.run ? ` · run ${observation.evidence.run.id} · ${observation.evidence.run.status}` : ''}</p><pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs text-foreground">{observation.evidence.payload}</pre></details> : null}
  </article>
}

function ListingDetailPage() {
  const detail = Route.useLoaderData() as ListingDetail | null
  if (!detail) return <main className="w-full px-2 py-3" id="main-content"><Link className="text-xs text-primary underline" to="/listings">← Listings</Link><p className="mt-3 text-sm">Listing not found.</p></main>
  const imageUrls = [...new Set([detail.imageUrl, ...detail.product.imageUrls].filter((url): url is string => Boolean(url)))]
  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <div className="flex flex-wrap items-center justify-between gap-2"><Link to="/listings" className="text-xs text-primary underline">← Listings</Link><a href={detail.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open source listing ↗</a></div>
    <div className="mt-3 flex flex-wrap gap-4">
      <div className="flex max-w-full shrink-0 flex-wrap gap-1" aria-label="Product images">{imageUrls.length ? imageUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Open product image ${index + 1}`} className="flex size-32 items-center justify-center rounded border border-border bg-card"><img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" /></a>) : <div className="flex size-32 items-center justify-center rounded border border-border bg-card text-xs text-muted-foreground">No image</div>}</div>
      <div className="min-w-0 flex-1"><h1 className="text-lg font-medium text-foreground">{detail.product.title}</h1><p className="mt-1 text-xs text-muted-foreground">{detail.source.displayName}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4 lg:grid-cols-7"><Field label="Manufacturer" value={detail.product.brand ?? '—'} /><Field label="Category" value={detail.product.productType ?? '—'} /><Field label="SKU" value={detail.variant.sku ?? '—'} /><Field label="Price" value={money(detail.current.price, detail.current.currency)} /><Field label="Was" value={detail.current.compareAtPrice && Number(detail.current.compareAtPrice) > Number(detail.current.price ?? 0) ? money(detail.current.compareAtPrice, detail.current.currency) : '—'} /><Field label="Stock" value={detail.current.available ? 'In stock' : 'Out'} /><Field label="Observed" value={detail.current.observedAt.toLocaleString()} />{detail.variant.title && detail.variant.title !== 'Default Title' ? <Field label="Variant" value={detail.variant.title} /> : null}</dl>
        {detail.product.tags.length ? <p className="mt-3 text-xs text-muted-foreground">Tags: {detail.product.tags.join(', ')}</p> : null}
      </div>
    </div>
    {detail.product.description ? <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">{detail.product.description}</p> : null}
    <section className="mt-5" aria-label="Listing observations and evidence"><h2 className="text-sm font-medium text-foreground">Observation history ({detail.observations.length})</h2>{detail.observations.length ? <div className="mt-2">{detail.observations.map((observation) => <Observation key={observation.id} observation={observation} />)}</div> : <p className="mt-2 text-xs text-muted-foreground">No observations recorded yet.</p>}</section>
  </main>
}
