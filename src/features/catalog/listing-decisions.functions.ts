import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { addSharedListingDecisionNote, getListingDecision, listListingDecisionHistory, saveListingDecision } from './listing-decisions.server'
import { addSharedListingDecisionNoteInputSchema, listingIdInputSchema, saveListingDecisionInputSchema } from './listing-decisions.schemas'
export const getCurrentListingDecision = createServerFn({ method: 'GET' }).validator(listingIdInputSchema).handler(async ({ data }) => { const session = await requireSession(); setResponseHeader('Cache-Control', 'private, no-store'); return getListingDecision(getDatabase(), session.user.id, data.listingId) })
export const saveCurrentListingDecision = createServerFn({ method: 'POST' }).validator(saveListingDecisionInputSchema).handler(async ({ data }) => { const session = await requireSession(); setResponseHeader('Cache-Control', 'private, no-store'); return saveListingDecision(getDatabase(), session.user.id, data) })
export const getListingDecisionHistory = createServerFn({ method: 'GET' }).validator(listingIdInputSchema).handler(async ({ data }) => { await requireSession(); setResponseHeader('Cache-Control', 'private, no-store'); return listListingDecisionHistory(getDatabase(), data.listingId) })
export const addCurrentListingSharedDecisionNote = createServerFn({ method: 'POST' }).validator(addSharedListingDecisionNoteInputSchema).handler(async ({ data }) => { const session = await requireSession(); setResponseHeader('Cache-Control', 'private, no-store'); return addSharedListingDecisionNote(getDatabase(), session.user.id, data) })
