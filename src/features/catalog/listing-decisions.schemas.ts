import { z } from 'zod'
import { legacyListingDecisionStates, reviewDecisionStates } from '~/server/db/schema/listing-decisions'

export const reviewDecisionStateSchema = z.enum(reviewDecisionStates)
export const legacyListingDecisionStateSchema = z.enum(legacyListingDecisionStates)
export const listingDecisionStateSchema = z.union([reviewDecisionStateSchema, legacyListingDecisionStateSchema])
export const listingIdInputSchema = z.object({ listingId: z.uuid() })
export const saveListingDecisionInputSchema = z.object({ listingId: z.uuid(), state: reviewDecisionStateSchema, note: z.string().trim().max(500), expectedQuantity: z.number().int().positive().max(100_000).nullable() })
export const addSharedListingDecisionNoteInputSchema = z.object({ listingId: z.uuid(), body: z.string().trim().min(1).max(2_000) })

export const legacyDecisionStateLabels: Record<z.infer<typeof legacyListingDecisionStateSchema>, string> = {
  unreviewed: 'Unreviewed (legacy)', researching: 'Researching (legacy)', pass: 'Pass (legacy)', buy_candidate: 'Buy candidate (legacy)',
}
