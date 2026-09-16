import { createFileRoute, redirect } from '@tanstack/react-router'
import { CurrentListingsTable } from '~/features/catalog/current-listings-table'
import { listCurrentListings } from '~/features/catalog/catalog.functions'
import { getPublicSession } from '~/features/auth/auth.functions'

export const Route = createFileRoute('/listings')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: () => listCurrentListings(),
  component: ListingsPage,
})
function ListingsPage() {
  const { listings } = Route.useLoaderData()
  return <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" id="main-content"><p className="text-sm font-medium text-primary">Catalog review</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Current listings</h1><p className="mt-2 text-muted-foreground">Normalized inventory across every registered source and module.</p><section className="mt-8" aria-label="Current catalog listings">{listings.length ? <CurrentListingsTable listings={listings} /> : <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">No current listings yet. Run a collection for a registered source to populate this tracker.</p>}</section></main>
}
