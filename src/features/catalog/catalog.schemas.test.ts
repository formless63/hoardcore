import { describe, expect, it } from 'vitest'
import { currentListingsResponseSchema } from './catalog.schemas'

describe('current listing tracker contract', () => {
  it('accepts listings from different sources and modules', () => {
    const listing = {
      id: 'listing-1', url: 'https://catalog.example.test/item', sourceId: 'source-1', sourceName: 'Outlet A', moduleId: 'generic-catalog',
      productId: 'product-1', productTitle: 'Example item', variantId: 'variant-1', variantTitle: 'Blue', sku: 'SKU-1', title: 'Example item — Blue',
      price: '12.50', currency: 'USD', available: true, observedAt: new Date(),
    }
    expect(currentListingsResponseSchema.parse({ listings: [listing] }).listings[0]?.sourceName).toBe('Outlet A')
  })
})
