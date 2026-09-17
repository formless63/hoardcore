import { describe, expect, it } from 'vitest'
import { currentListingsResponseSchema } from './catalog.schemas'

describe('current listing tracker contract', () => {
  it('accepts listings from different sources and modules', () => {
    const listing = {
      id: 'listing-1', url: 'https://catalog.example.test/item', sourceId: 'source-1', sourceName: 'Outlet A', moduleId: 'generic-catalog',
      productId: 'product-1', productTitle: 'Example item', manufacturer: 'Example Maker', category: 'Components', categoryGroup: 'controls', tags: ['example'], variantId: 'variant-1', variantTitle: 'Blue', sku: 'SKU-1', imageUrl: null, title: 'Example item — Blue',
      price: '12.50', compareAtPrice: '19.00', currency: 'USD', available: true, stockQuantity: null, observedAt: new Date(),
    }
    expect(currentListingsResponseSchema.parse({ listings: [listing] }).listings[0]?.sourceName).toBe('Outlet A')
  })
})
