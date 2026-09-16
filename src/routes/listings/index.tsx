import { createFileRoute, redirect } from '@tanstack/react-router'
import { CurrentListingsTable } from '~/features/catalog/current-listings-table'
import { listCurrentListings } from '~/features/catalog/catalog.functions'
import { getPublicSession } from '~/features/auth/auth.functions'

export const Route = createFileRoute('/listings/')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loader: () => listCurrentListings(),
  head: () => ({ meta: [{ title: 'Listings · Hoardcore' }] }),
  component: ListingsPage,
})

function ListingsPage() {
  const { listings } = Route.useLoaderData()
  return (
    <main className="w-full px-1 py-2 sm:px-2" id="main-content">
      <h1 className="sr-only">Current listings</h1>
      <CurrentListingsTable listings={listings} />
    </main>
  )
}
