import { describe, expect, it } from 'vitest'
import { calculateOpportunity } from './calculate'

describe('opportunity calculations', () => {
  it('uses deterministic fees and acquisition-based ROI', () => {
    expect(calculateOpportunity({ acquisition: 40, resale: 100, feePercent: 12, shipping: 8, otherCosts: 5 }))
      .toEqual({ fees: 12, totalCost: 65, profit: 35, roiPercent: 87.5 })
  })

  it('does not invent an ROI when acquisition is zero', () => {
    expect(calculateOpportunity({ acquisition: 0, resale: 10, feePercent: 0, shipping: 0, otherCosts: 0 })?.roiPercent).toBeNull()
  })

  it('rejects invalid or negative inputs', () => {
    expect(calculateOpportunity({ acquisition: 1, resale: 10, feePercent: 101, shipping: 0, otherCosts: 0 })).toBeNull()
    expect(calculateOpportunity({ acquisition: NaN, resale: 10, feePercent: 10, shipping: 0, otherCosts: 0 })).toBeNull()
    expect(calculateOpportunity({ acquisition: 1, resale: 10.001, feePercent: 10, shipping: 0, otherCosts: 0 })).toBeNull()
  })

  it('calculates in cents instead of accumulating floating-point currency errors', () => {
    expect(calculateOpportunity({ acquisition: 0.1, resale: 0.3, feePercent: 0, shipping: 0.2, otherCosts: 0 })?.profit).toBe(0)
  })
})
