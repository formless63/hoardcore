import { describe, expect, it } from 'vitest'
import { emptyOpportunityQueueFilters, rankOpportunityQueue, type OpportunityQueueItem } from './opportunity-queue'
import { indexOpportunityResearchSignals } from './opportunity-queue.server'
const item = (id: string, profit: number | null, risk: OpportunityQueueItem['research']['risk']): OpportunityQueueItem => ({ listingId: id, title: id, sourceName: 'Test', state: 'watch', currency: 'USD', calculation: profit === null ? null : { status: 'complete', grossRevenue: 100, platformFees: 0, paymentFees: 0, totalFees: 0, totalCost: 100 - profit, profit, roiPercent: profit, marginPercent: profit, breakEvenUnitPrice: 1, downsideRevenue: 80, downsideProfit: profit - 20 }, research: { confidence: .8, demand: 3, liquidity: 2, risk } })
describe('opportunity queue ranking', () => {
  it('sorts deterministically and does not treat missing economics as profit', () => expect(rankOpportunityQueue([item('missing', null, null), item('best', 20, 'low'), item('next', 10, 'medium')], emptyOpportunityQueueFilters).map((row) => row.listingId)).toEqual(['best', 'next', 'missing']))
  it('filters by deterministic economics and transparent risk threshold', () => expect(rankOpportunityQueue([item('low', 20, 'low'), item('high', 50, 'high'), item('none', null, null)], { ...emptyOpportunityQueueFilters, minimumProfit: 15, maximumRisk: 'medium' }).map((row) => row.listingId)).toEqual(['low']))

  it('indexes many payload records once and combines only each listing’s own signals', () => {
    const record = (listingId: string, confidence: number, demand: number, risk: 'low' | 'high') => ({ reference: { entityType: 'source_listing' as const, hoardcoreId: listingId }, status: 'valid' as const, claims: [{ field: 'confidence', value: 'fixture', confidence, citationIds: [] }], marketEstimates: [{ estimateType: 'demand' as const, amount: demand, confidence, citationIds: [] }], comparables: [], risks: [{ description: 'fixture', severity: risk, citationIds: [] }], citations: [], diagnostics: [] })
    const payload = (id: string, records: ReturnType<typeof record>[]) => ({ resultVersion: '1.0', packetVersion: '1.0', promptVersion: '1.0', schemaVersion: '1.0', packetId: `packet-${id}`, resultId: `result-${id}`, completedAt: '2026-09-17T00:00:00.000Z', records })
    const signals = indexOpportunityResearchSignals([payload('one', [record('listing-a', .5, 2, 'low'), record('listing-b', .8, 9, 'high')]), payload('two', Array.from({ length: 100 }, (_, index) => record(index % 2 ? 'listing-a' : 'listing-c', 1, index, 'low')))])
    expect(signals.get('listing-a')).toMatchObject({ demand: expect.any(Number), risk: 'low' })
    expect(signals.get('listing-b')).toEqual({ confidence: .8, demand: 9, liquidity: null, risk: 'high' })
    expect(signals.has('listing-c')).toBe(true)
  })
})
