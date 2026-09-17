import type { ResearchSummariesByListing } from './research.server'

/**
 * Keep catalog enrichment requests below the public server-function payload
 * limit. Sequential requests deliberately avoid multiplying a large catalog
 * load into concurrent comparable-evidence queries.
 */
export const RESEARCH_SUMMARY_BATCH_SIZE = 5_000

export async function loadResearchSummariesInBatches(
  listingIds: readonly string[],
  loadBatch: (listingIds: string[]) => Promise<ResearchSummariesByListing>,
): Promise<ResearchSummariesByListing> {
  const uniqueListingIds = [...new Set(listingIds)]
  const summaries: ResearchSummariesByListing = {}

  for (let start = 0; start < uniqueListingIds.length; start += RESEARCH_SUMMARY_BATCH_SIZE) {
    Object.assign(summaries, await loadBatch(uniqueListingIds.slice(start, start + RESEARCH_SUMMARY_BATCH_SIZE)))
  }

  return summaries
}
