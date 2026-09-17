import { and, eq } from 'drizzle-orm'
import type { Database } from '~/server/db/db.server'
import { listCurrentCatalogListings } from '~/server/db/catalog-persistence.server'
import { listingDecisions } from '~/server/db/schema/listing-decisions'
import { opportunityAssumptions } from '~/server/db/schema/opportunities'
import { researchBatches, researchSubmissions } from '~/server/db/schema/research'
import { parseResearchResult } from '~/features/research/research.schemas'
import { opportunityInputsSchema } from './opportunity.schemas'
import { calculationForInputs, type OpportunityQueueItem, type OpportunityResearchSignals } from './opportunity-queue'

const severity = { low: 0, medium: 1, high: 2, critical: 3 } as const
function signalsFor(payloads: unknown[], listingId: string): OpportunityResearchSignals {
  const confidences: number[] = []; const estimates: Partial<Record<'demand' | 'liquidity', number[]>> = {}; let risk: OpportunityResearchSignals['risk'] = null
  for (const payload of payloads) { try { const result = parseResearchResult(payload); for (const record of result.records.filter((item) => item.reference.hoardcoreId === listingId)) { for (const claim of record.claims) if (claim.confidence !== undefined) confidences.push(claim.confidence); for (const estimate of record.marketEstimates) { if (estimate.confidence !== undefined) confidences.push(estimate.confidence); if ((estimate.estimateType === 'demand' || estimate.estimateType === 'liquidity') && estimate.amount !== undefined) (estimates[estimate.estimateType] ??= []).push(estimate.amount) } for (const item of record.risks) if (!risk || severity[item.severity] > severity[risk]) risk = item.severity } } catch { /* durable raw evidence remains available elsewhere; malformed historical payloads do not break the queue */ } }
  const average = (values: number[] | undefined) => values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  return { confidence: average(confidences), demand: average(estimates.demand), liquidity: average(estimates.liquidity), risk }
}

export async function listOpportunityQueue(db: Database, userId: string): Promise<OpportunityQueueItem[]> {
  const listings = await listCurrentCatalogListings(db)
  const ids = listings.map((listing) => listing.id)
  const [decisions, assumptions, submissions] = await Promise.all([
    db.select({ listingId: listingDecisions.listingId, state: listingDecisions.state }).from(listingDecisions).where(eq(listingDecisions.userId, userId)),
    db.select({ listingId: opportunityAssumptions.listingId, currency: opportunityAssumptions.currency, inputs: opportunityAssumptions.inputs }).from(opportunityAssumptions).where(eq(opportunityAssumptions.userId, userId)),
    db.select({ payload: researchSubmissions.normalizedPayload }).from(researchSubmissions).innerJoin(researchBatches, eq(researchBatches.id, researchSubmissions.batchId)).where(and(eq(researchBatches.createdByUserId, userId), eq(researchSubmissions.status, 'valid'))),
  ])
  const decisionByListing = new Map(decisions.map((item) => [item.listingId, item.state])); const assumptionsByListing = new Map(assumptions.map((item) => [item.listingId, item])); const payloads = submissions.map((item) => item.payload).filter(Boolean)
  return listings.map((listing) => { const assumption = assumptionsByListing.get(listing.id); const inputs = assumption ? opportunityInputsSchema.safeParse(assumption.inputs).data : undefined; return { listingId: listing.id, title: listing.productTitle, sourceName: listing.sourceName, state: decisionByListing.get(listing.id) ?? 'interesting', currency: assumption?.currency ?? listing.currency, calculation: calculationForInputs(inputs), research: signalsFor(payloads, listing.id) } })
}
