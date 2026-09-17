import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { getOpportunityAssumptions, saveOpportunityAssumptions } from './opportunity.server'
import { opportunityAssumptionInputSchema, opportunityListingIdSchema } from './opportunity.schemas'
export const getCurrentOpportunityAssumptions = createServerFn({ method: 'GET' }).validator(opportunityListingIdSchema).handler(async ({ data }) => { const session = await requireSession(); setResponseHeader('Cache-Control', 'private, no-store'); return getOpportunityAssumptions(getDatabase(), session.user.id, data.listingId) })
export const saveCurrentOpportunityAssumptions = createServerFn({ method: 'POST' }).validator(opportunityAssumptionInputSchema).handler(async ({ data }) => { const session = await requireSession(); setResponseHeader('Cache-Control', 'private, no-store'); return saveOpportunityAssumptions(getDatabase(), session.user.id, data) })
