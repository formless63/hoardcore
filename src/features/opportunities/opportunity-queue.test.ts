import { describe, expect, it } from 'vitest'
import { emptyOpportunityQueueFilters, rankOpportunityQueue, type OpportunityQueueItem } from './opportunity-queue'
const item = (id: string, profit: number | null, risk: OpportunityQueueItem['research']['risk']): OpportunityQueueItem => ({ listingId: id, title: id, sourceName: 'Test', state: 'watch', currency: 'USD', calculation: profit === null ? null : { status: 'complete', grossRevenue: 100, platformFees: 0, paymentFees: 0, totalFees: 0, totalCost: 100 - profit, profit, roiPercent: profit, marginPercent: profit, breakEvenUnitPrice: 1, downsideRevenue: 80, downsideProfit: profit - 20 }, research: { confidence: .8, demand: 3, liquidity: 2, risk } })
describe('opportunity queue ranking', () => {
  it('sorts deterministically and does not treat missing economics as profit', () => expect(rankOpportunityQueue([item('missing', null, null), item('best', 20, 'low'), item('next', 10, 'medium')], emptyOpportunityQueueFilters).map((row) => row.listingId)).toEqual(['best', 'next', 'missing']))
  it('filters by deterministic economics and transparent risk threshold', () => expect(rankOpportunityQueue([item('low', 20, 'low'), item('high', 50, 'high'), item('none', null, null)], { ...emptyOpportunityQueueFilters, minimumProfit: 15, maximumRisk: 'medium' }).map((row) => row.listingId)).toEqual(['low']))
})
