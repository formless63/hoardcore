import { describe, expect, it } from 'vitest'
import { listingPriceSortValue } from './listing-sort-values'

describe('listingPriceSortValue', () => {
  it('keeps an absent or invalid source price out of numeric sorting', () => {
    expect(listingPriceSortValue(null)).toBeUndefined()
    expect(listingPriceSortValue('not reported')).toBeUndefined()
  })

  it('preserves legitimate zero-valued prices', () => {
    expect(listingPriceSortValue('0.00')).toBe(0)
    expect(listingPriceSortValue('19.95')).toBe(19.95)
  })
})
