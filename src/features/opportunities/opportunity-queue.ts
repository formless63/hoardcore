import { calculateOpportunity, type OpportunityCalculation } from './calculate'
import type { OpportunityInputsWithProvenance } from './opportunity.schemas'

export type OpportunityState = 'unreviewed' | 'researching' | 'pass' | 'buy_candidate' | 'interesting' | 'watch' | 'ignore' | 'buy' | 'archived'
export type OpportunityResearchSignals = { confidence: number | null; demand: number | null; liquidity: number | null; risk: 'low' | 'medium' | 'high' | 'critical' | null }
export type OpportunityQueueItem = { listingId: string; title: string; sourceName: string; state: OpportunityState; currency: string | null; calculation: OpportunityCalculation | null; research: OpportunityResearchSignals }
export type OpportunityQueueFilters = { states: OpportunityState[]; minimumProfit: number | null; maximumRisk: OpportunityResearchSignals['risk'] | null; hasSavedEconomics: boolean | null; sort: 'profit' | 'roi' | 'confidence' | 'demand' | 'liquidity' | 'risk' | 'title' }
export const emptyOpportunityQueueFilters: OpportunityQueueFilters = { states: [], minimumProfit: null, maximumRisk: null, hasSavedEconomics: null, sort: 'profit' }
const riskRank = { low: 0, medium: 1, high: 2, critical: 3 } as const

export function rankOpportunityQueue(items: OpportunityQueueItem[], filters: OpportunityQueueFilters) {
  const maximumRisk = filters.maximumRisk === null ? undefined : riskRank[filters.maximumRisk]
  const filtered = items.filter((item) => (filters.states.length === 0 || filters.states.includes(item.state)) && (filters.minimumProfit === null || (item.calculation?.status === 'complete' && item.calculation.profit >= filters.minimumProfit)) && (filters.hasSavedEconomics === null || (filters.hasSavedEconomics === (item.calculation !== null))) && (maximumRisk === undefined || item.research.risk === null || riskRank[item.research.risk] <= maximumRisk))
  const value = (item: OpportunityQueueItem) => { if (filters.sort === 'profit') return item.calculation?.status === 'complete' ? item.calculation.profit : null; if (filters.sort === 'roi') return item.calculation?.status === 'complete' ? item.calculation.roiPercent : null; if (filters.sort === 'risk') return item.research.risk === null ? null : -riskRank[item.research.risk]; return item.research[filters.sort as 'confidence' | 'demand' | 'liquidity'] }
  return filtered.sort((left, right) => { if (filters.sort === 'title') return left.title.localeCompare(right.title); const delta = (value(right) ?? -Infinity) - (value(left) ?? -Infinity); return delta || left.title.localeCompare(right.title) })
}

export function calculationForInputs(inputs: OpportunityInputsWithProvenance | undefined) { return inputs ? calculateOpportunity({ quantity: inputs.quantity.value, acquisitionCost: inputs.acquisitionCost.value, estimatedMarketValue: inputs.estimatedMarketValue.value, platformFeePercent: inputs.platformFeePercent.value, paymentFeePercent: inputs.paymentFeePercent.value, shipping: inputs.shipping.value, tax: inputs.tax.value, handling: inputs.handling.value, otherCosts: inputs.otherCosts.value, downsidePercent: inputs.downsidePercent.value }) : null }
