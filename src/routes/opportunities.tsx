import { createFileRoute, redirect } from '@tanstack/react-router'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getOpportunityQueue } from '~/features/opportunities/opportunity-queue.functions'
import { OpportunityQueueTable } from '~/features/opportunities/opportunity-queue-table'
export const Route = createFileRoute('/opportunities')({ beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) }, loader: () => getOpportunityQueue(), head: () => ({ meta: [{ title: 'Opportunities · Hoardcore' }] }), component: Opportunities })
function Opportunities() { return <main className="w-full px-2 py-3 sm:px-3" id="main-content"><h1 className="text-base font-semibold">Opportunity queue</h1><p className="mt-1 text-xs text-muted-foreground">Ranked signals are shown with their inputs; use a listing to inspect source evidence and imported research.</p><OpportunityQueueTable items={Route.useLoaderData()} /></main> }
