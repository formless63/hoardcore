import { describe, expect, it } from 'vitest'
import { RESEARCH_SUMMARY_BATCH_SIZE, loadResearchSummariesInBatches } from './research-summary-batching'

function listingId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

describe('research summary batching', () => {
  it('loads more than 5,000 listings without exceeding the server-function batch limit', async () => {
    const listingIds = Array.from({ length: RESEARCH_SUMMARY_BATCH_SIZE + 1 }, (_, index) => listingId(index))
    const batches: string[][] = []

    const summaries = await loadResearchSummariesInBatches(listingIds, async (batch) => {
      batches.push(batch)
      return Object.fromEntries(batch.map((id) => [id, {}]))
    })

    expect(batches.map((batch) => batch.length)).toEqual([RESEARCH_SUMMARY_BATCH_SIZE, 1])
    expect(Object.keys(summaries)).toHaveLength(RESEARCH_SUMMARY_BATCH_SIZE + 1)
    expect(summaries[listingIds[0]!]).toEqual({})
    expect(summaries[listingIds.at(-1)!]).toEqual({})
  })

  it('does not load duplicate listing IDs twice', async () => {
    const first = listingId(1)
    const second = listingId(2)
    const batches: string[][] = []

    await loadResearchSummariesInBatches([first, first, second], async (batch) => {
      batches.push(batch)
      return {}
    })

    expect(batches).toEqual([[first, second]])
  })
})
