import { describe, expect, it } from 'vitest'
import { calculateOpportunity } from './calculate'

describe('opportunity calculations', () => {
  const complete = { quantity: 2, acquisitionCost: 40, estimatedMarketValue: 100, platformFeePercent: 12, paymentFeePercent: 3, shipping: 8, tax: 5, handling: 2, otherCosts: 1, downsidePercent: 20 } as const

  it('uses deterministic, cent-rounded costs and scenario fees', () => {
    expect(calculateOpportunity(complete)).toEqual({ status: 'complete', grossRevenue: 200, platformFees: 24, paymentFees: 6, totalFees: 30, totalCost: 126, profit: 74, roiPercent: 58.730158730158735, marginPercent: 37, breakEvenUnitPrice: 56.48, downsideRevenue: 160, downsideProfit: 40 })
  })

  it('reports missing values rather than assuming a value', () => {
    expect(calculateOpportunity({ ...complete, estimatedMarketValue: null, tax: null })).toEqual({ status: 'incomplete', missing: ['estimatedMarketValue', 'tax'] })
  })

  it('rejects invalid values and impossible combined fees', () => {
    expect(calculateOpportunity({ ...complete, quantity: 0 })).toEqual({ status: 'invalid' })
    expect(calculateOpportunity({ ...complete, platformFeePercent: 90, paymentFeePercent: 11 })).toEqual({ status: 'invalid' })
    expect(calculateOpportunity({ ...complete, shipping: 1.001 })).toEqual({ status: 'invalid' })
    expect(calculateOpportunity({ ...complete, quantity: 1_000_000, estimatedMarketValue: 999_999_999_999.99 })).toEqual({ status: 'invalid' })
  })

  it('calculates cents without floating-point accumulation and exposes downside', () => {
    const result = calculateOpportunity({ ...complete, quantity: 1, acquisitionCost: 0.1, estimatedMarketValue: 0.3, platformFeePercent: 0, paymentFeePercent: 0, shipping: 0.2, tax: 0, handling: 0, otherCosts: 0, downsidePercent: 50 })
    expect(result).toMatchObject({ status: 'complete', profit: 0, downsideRevenue: 0.15, downsideProfit: -0.15 })
  })
})
