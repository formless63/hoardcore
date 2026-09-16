import { createFileRoute, redirect } from '@tanstack/react-router'
import { CurrentListingsTable } from '~/features/catalog/current-listings-table'
import { listCurrentListings } from '~/features/catalog/catalog.functions'
import { getPublicSession } from '~/features/auth/auth.functions'
import { listSavedListingViews } from '~/features/catalog/saved-views.functions'
import { listWatchedListingIds } from '~/features/watchlist/watchlist.functions'
import { listResearchSummariesForListings } from '~/features/research/research.functions'

export const Route = createFileRoute('/listings/')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: async () => {
    const [{ listings }, savedViews, watchedListingIds] = await Promise.all([listCurrentListings(), listSavedListingViews(), listWatchedListingIds()])
    const researchSummaries = listings.length ? await listResearchSummariesForListings({ data: { listingIds: listings.map((listing) => listing.id) } }) : {}
    return { listings, savedViews, watchedListingIds, researchSummaries }
  },
  head: () => ({ meta: [{ title: 'Listings · Hoardcore' }] }),
  component: ListingsPage,
})

function ListingsPage() {
  const { listings, savedViews, watchedListingIds, researchSummaries } = Route.useLoaderData()
  return (
    <main className="w-full px-1 py-2 sm:px-2" id="main-content">
      <h1 className="sr-only">Current listings</h1>
      <CurrentListingsTable listings={listings} savedViews={savedViews} watchedListingIds={watchedListingIds} researchSummaries={researchSummaries} />
    </main>
  )
}
