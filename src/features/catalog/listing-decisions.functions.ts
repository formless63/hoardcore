import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { getListingDecision, saveListingDecision } from './listing-decisions.server'
const input = z.object({ listingId: z.uuid(), state: z.enum(['unreviewed', 'researching', 'pass', 'buy_candidate']), note: z.string().trim().max(500), expectedQuantity: z.number().int().positive().max(100000).nullable() })
export const getCurrentListingDecision = createServerFn({ method: 'GET' }).validator(z.object({ listingId: z.uuid() })).handler(async ({ data }) => { const session = await requireSession(); return getListingDecision(getDatabase(), session.user.id, data.listingId) })
export const saveCurrentListingDecision = createServerFn({ method: 'POST' }).validator(input).handler(async ({ data }) => { const session = await requireSession(); return saveListingDecision(getDatabase(), session.user.id, data.listingId, data) })
