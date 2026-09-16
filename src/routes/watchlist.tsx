import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { getPublicSession } from '~/features/auth/auth.functions'
import { listWatchedListings, setListingWatched } from '~/features/watchlist/watchlist.functions'

export const Route = createFileRoute('/watchlist')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: () => listWatchedListings(),
  head: () => ({ meta: [{ title: 'Watchlist · Hoardcore' }] }),
  component: WatchlistPage,
})

function money(value: string | null, currency: string | null) {
  if (value === null) return '—'
  const amount = Number(value)
  return Number.isFinite(amount) && currency ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) : value
}

function WatchlistPage() {
  const listings = Route.useLoaderData()
  const setWatched = useServerFn(setListingWatched)
  const [hidden, setHidden] = useState(new Set<string>())
  const [busy, setBusy] = useState<string>()
  async function remove(listingId: string) {
    setBusy(listingId)
    try { await setWatched({ data: { listingId, watched: false } }); setHidden((current) => new Set([...current, listingId])) } finally { setBusy(undefined) }
  }
  const visible = listings.filter((listing) => !hidden.has(listing.id))
  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <div className="mb-2 flex items-center justify-between gap-2"><h1 className="text-sm font-medium">Watchlist</h1><Link to="/listings" className="text-xs text-primary underline">Browse listings</Link></div>
    <p className="mb-3 text-xs text-muted-foreground">Watched items are private to your account. Alert delivery is optional and configured in notification settings.</p>
    {visible.length ? <div className="overflow-x-auto rounded border border-border"><table className="w-full text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr><th className="px-2 py-1.5 font-medium">Title</th><th className="px-2 py-1.5 font-medium">Source</th><th className="px-2 py-1.5 font-medium">Price</th><th className="px-2 py-1.5 font-medium">Stock</th><th className="px-2 py-1.5 font-medium" /></tr></thead><tbody>{visible.map((listing) => <tr key={listing.id} className="border-b border-border last:border-0"><td className="px-2 py-1.5"><Link to="/listings/$listingId" params={{ listingId: listing.id }} className="text-primary hover:underline">{listing.title}</Link>{listing.variantTitle && listing.variantTitle !== 'Default Title' ? <span className="ml-1 text-muted-foreground">· {listing.variantTitle}</span> : null}</td><td className="px-2 py-1.5">{listing.sourceName}</td><td className="px-2 py-1.5">{money(listing.price, listing.currency)}</td><td className="px-2 py-1.5">{listing.available ? 'In stock' : 'Out'}</td><td className="px-2 py-1.5 text-right"><button type="button" className="text-muted-foreground hover:text-destructive" disabled={busy === listing.id} onClick={() => void remove(listing.id)}>Unwatch</button></td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-xs text-muted-foreground">No watched listings yet.</p>}
  </main>
}
