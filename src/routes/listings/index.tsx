import { createFileRoute, redirect } from '@tanstack/react-router'
import { CurrentListingsTable } from '~/features/catalog/current-listings-table'
import { listCurrentListings } from '~/features/catalog/catalog.functions'
import { getPublicSession } from '~/features/auth/auth.functions'
import { listSavedListingViews } from '~/features/catalog/saved-views.functions'
import { listWatchedListingIds } from '~/features/watchlist/watchlist.functions'
import { listResearchSummariesForListings } from '~/features/research/research.functions'
import { loadResearchSummariesInBatches } from '~/features/research/research-summary-batching'
import { ListingLoadError, ListingsPending } from '~/features/catalog/listing-load-state'
import { listingWorkbenchSearchSchema } from '~/features/catalog/listing-workbench-state'

export const Route = createFileRoute('/listings/')({
  validateSearch: listingWorkbenchSearchSchema,
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: async () => {
    const [{ listings }, savedViews, watchedListingIds] = await Promise.all([listCurrentListings(), listSavedListingViews(), listWatchedListingIds()])
    const researchSummaries = await loadResearchSummariesInBatches(
      listings.map((listing) => listing.id),
      (listingIds) => listResearchSummariesForListings({ data: { listingIds } }),
    )
    return { listings, savedViews, watchedListingIds, researchSummaries }
  },
  head: () => ({ meta: [{ title: 'Listings · Hoardcore' }] }),
  pendingMs: 100,
  pendingMinMs: 200,
  pendingComponent: ListingsPending,
  errorComponent: ListingLoadError,
  component: ListingsPage,
})

function ListingsPage() {
  const { listings, savedViews, watchedListingIds, researchSummaries } = Route.useLoaderData()
  const workbench = Route.useSearch()
  return (
    <main className="w-full px-1 py-2 sm:px-2" id="main-content">
      <h1 className="sr-only">Current listings</h1>
      <CurrentListingsTable listings={listings} savedViews={savedViews} watchedListingIds={watchedListingIds} researchSummaries={researchSummaries} workbench={workbench} />
    </main>
  )
}
