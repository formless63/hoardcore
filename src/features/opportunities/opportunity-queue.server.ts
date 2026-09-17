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
type SignalAccumulator = { confidences: number[]; demand: number[]; liquidity: number[]; risk: OpportunityResearchSignals['risk'] }
function emptySignals(): OpportunityResearchSignals { return { confidence: null, demand: null, liquidity: null, risk: null } }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }

/** Parses each durable research submission once, then indexes its records by listing. */
export function indexOpportunityResearchSignals(payloads: unknown[]): Map<string, OpportunityResearchSignals> {
  const accumulators = new Map<string, SignalAccumulator>()
  for (const payload of payloads) try {
    const result = parseResearchResult(payload)
    for (const record of result.records) {
      const listingId = record.reference.entityType === 'source_listing' ? record.reference.hoardcoreId : undefined
      if (!listingId) continue
      const signal = accumulators.get(listingId) ?? { confidences: [], demand: [], liquidity: [], risk: null }
      for (const claim of record.claims) if (claim.confidence !== undefined) signal.confidences.push(claim.confidence)
      for (const estimate of record.marketEstimates) { if (estimate.confidence !== undefined) signal.confidences.push(estimate.confidence); if (estimate.estimateType === 'demand' && estimate.amount !== undefined) signal.demand.push(estimate.amount); if (estimate.estimateType === 'liquidity' && estimate.amount !== undefined) signal.liquidity.push(estimate.amount) }
      for (const risk of record.risks) if (!signal.risk || severity[risk.severity] > severity[signal.risk]) signal.risk = risk.severity
      accumulators.set(listingId, signal)
    }
  } catch { /* malformed historical payloads remain inspectable but do not break the queue */ }
  return new Map([...accumulators].map(([listingId, signal]) => [listingId, { confidence: average(signal.confidences), demand: average(signal.demand), liquidity: average(signal.liquidity), risk: signal.risk }]))
}

export async function listOpportunityQueue(db: Database, userId: string): Promise<OpportunityQueueItem[]> {
  const listings = await listCurrentCatalogListings(db)
  const [decisions, assumptions, submissions] = await Promise.all([
    db.select({ listingId: listingDecisions.listingId, state: listingDecisions.state }).from(listingDecisions).where(eq(listingDecisions.userId, userId)),
    db.select({ listingId: opportunityAssumptions.listingId, currency: opportunityAssumptions.currency, inputs: opportunityAssumptions.inputs }).from(opportunityAssumptions).where(eq(opportunityAssumptions.userId, userId)),
    db.select({ payload: researchSubmissions.normalizedPayload }).from(researchSubmissions).innerJoin(researchBatches, eq(researchBatches.id, researchSubmissions.batchId)).where(and(eq(researchBatches.createdByUserId, userId), eq(researchSubmissions.status, 'valid'))),
  ])
  const decisionByListing = new Map(decisions.map((item) => [item.listingId, item.state])); const assumptionsByListing = new Map(assumptions.map((item) => [item.listingId, item])); const signalsByListing = indexOpportunityResearchSignals(submissions.map((item) => item.payload).filter(Boolean))
  return listings.map((listing) => { const assumption = assumptionsByListing.get(listing.id); const inputs = assumption ? opportunityInputsSchema.safeParse(assumption.inputs).data : undefined; return { listingId: listing.id, title: listing.productTitle, sourceName: listing.sourceName, state: decisionByListing.get(listing.id) ?? 'interesting', currency: assumption?.currency ?? listing.currency, calculation: calculationForInputs(inputs), research: signalsByListing.get(listing.id) ?? emptySignals() } })
}
