import { describe, expect, it } from 'vitest'
import { currentListingSchema } from './catalog.schemas'
import { emptyListingFilters, listingDiscount, listingFiltersSchema, matchesListingFilters } from './listing-filters'

const listing = currentListingSchema.parse({
  id: 'listing-1', url: 'https://example.test/item', sourceId: 'source-1', sourceName: 'Source one', moduleId: 'test',
  productId: 'product-1', productTitle: 'Example relay', manufacturer: 'Example maker', category: 'Controls', categoryGroup: 'controls', tags: ['surplus', 'relay'],
  variantId: 'variant-1', variantTitle: 'Default Title', sku: 'ABC-1', imageUrl: null,
  title: 'Example relay', price: '60.00', compareAtPrice: '100.00', currency: 'USD', available: true, stockQuantity: null, observedAt: new Date('2026-09-16T00:00:00Z'),
})

describe('saved listing filter contract', () => {
  it('matches source, stock, category, tags, price and discount boundaries', () => {
    const filters = { ...emptyListingFilters, query: 'surplus', sourceId: 'source-1', stock: 'in' as const, category: 'Controls', currency: 'USD', minPrice: 60, maxPrice: 60, minDiscountAmount: 40, maxDiscountAmount: 40, minDiscountPercent: 40, maxDiscountPercent: 40 }
    expect(matchesListingFilters(listing, listingFiltersSchema.parse(filters))).toBe(true)
    expect(matchesListingFilters(listing, { ...filters, minPrice: 61 })).toBe(false)
    expect(matchesListingFilters(listing, { ...filters, minDiscountPercent: 41 })).toBe(false)
    expect(matchesListingFilters(listing, { ...filters, sourceId: 'other' })).toBe(false)
  })

  it('does not invent discounts or prices for missing data', () => {
    const withoutComparison = { ...listing, compareAtPrice: null }
    expect(listingDiscount(withoutComparison)).toBeNull()
    expect(matchesListingFilters(withoutComparison, { ...emptyListingFilters, minDiscountAmount: 1 })).toBe(false)
    expect(matchesListingFilters({ ...listing, price: null }, { ...emptyListingFilters, maxPrice: 100 })).toBe(false)
  })

  it('keeps absolute amounts scoped to an explicitly selected currency', () => {
    const eur = { ...listing, currency: 'EUR' }
    const usdFilters = listingFiltersSchema.parse({ ...emptyListingFilters, currency: 'USD', minPrice: 50 })
    expect(matchesListingFilters({ ...listing, currency: null }, usdFilters)).toBe(false)
    expect(matchesListingFilters({ ...listing, currency: 'USD' }, usdFilters)).toBe(true)
    expect(matchesListingFilters(eur, usdFilters)).toBe(false)
  })

  it('rejects inverted ranges and future schema versions', () => {
    expect(listingFiltersSchema.safeParse({ ...emptyListingFilters, minPrice: 100, maxPrice: 20 }).success).toBe(false)
    expect(listingFiltersSchema.safeParse({ ...emptyListingFilters, version: 2 }).success).toBe(false)
    expect(listingFiltersSchema.safeParse({ ...emptyListingFilters, categoryGroup: 'not-a-group' }).success).toBe(false)
  })

  it('supports grouped filters and legacy saved views without a group', () => {
    const panel = { ...listing, category: 'Load Centers - Copper Bus', categoryGroup: 'distribution' }
    expect(matchesListingFilters(panel, { ...emptyListingFilters, categoryGroup: 'distribution' })).toBe(true)
    expect(matchesListingFilters(panel, { ...emptyListingFilters, categoryGroup: 'lighting' })).toBe(false)
    expect(matchesListingFilters(panel, { ...emptyListingFilters, categoryGroup: 'distribution', category: 'Panelboards & Accessories' })).toBe(false)
    expect(matchesListingFilters({ ...listing, category: 'Steel', categoryGroup: 'unmapped' }, { ...emptyListingFilters, categoryGroup: 'unmapped' })).toBe(true)
    const { categoryGroup: _omitted, ...previousVersionView } = emptyListingFilters
    expect(listingFiltersSchema.parse(previousVersionView).categoryGroup).toBe('')
  })
})
