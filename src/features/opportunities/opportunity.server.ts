import { and, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database } from '~/server/db/db.server'
import { opportunityAssumptions } from '~/server/db/schema/opportunities'
import { opportunityInputsSchema, type opportunityAssumptionInputSchema } from './opportunity.schemas'
type OpportunityInput = z.output<typeof opportunityAssumptionInputSchema>

export async function getOpportunityAssumptions(db: Database, userId: string, listingId: string) { const [row] = await db.select({ currency: opportunityAssumptions.currency, inputs: opportunityAssumptions.inputs, updatedAt: opportunityAssumptions.updatedAt }).from(opportunityAssumptions).where(and(eq(opportunityAssumptions.userId, userId), eq(opportunityAssumptions.listingId, listingId))); return row ? { ...row, inputs: opportunityInputsSchema.parse(row.inputs) } : null }
export async function saveOpportunityAssumptions(db: Database, userId: string, input: OpportunityInput) { await db.insert(opportunityAssumptions).values({ userId, ...input }).onConflictDoUpdate({ target: [opportunityAssumptions.userId, opportunityAssumptions.listingId], set: { currency: input.currency, inputs: input.inputs, updatedAt: new Date() } }); return getOpportunityAssumptions(db, userId, input.listingId) }
