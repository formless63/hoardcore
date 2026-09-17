import { describe, expect, it } from 'vitest'
import { listingTrendPoints, trendPolyline } from './listing-trends'
import type { ListingDetail } from './listing-detail.schemas'

const sample = (price: string | null, stockQuantity: number | null, day: number) => ({ price, stockQuantity, observedAt: new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`) }) as ListingDetail['observations'][number]

describe('listing trends', () => {
  it('sorts recent samples into chronological order and skips unknowns', () => {
    const observations = [sample('5.00', 0, 3), sample(null, null, 2), sample('8.00', 12, 1)]
    expect(listingTrendPoints(observations, 'price').map((point) => point.value)).toEqual([8, 5])
    expect(listingTrendPoints(observations, 'stockQuantity').map((point) => point.value)).toEqual([12, 0])
  })

  it('handles unchanged values without dividing by zero', () => {
    expect(trendPolyline([5, 5])).toBe('0.0,32.0 300.0,32.0')
    expect(trendPolyline([5])).toBe('')
  })
})
