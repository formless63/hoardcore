import { describe, expect, it } from 'vitest'
import { shopifyModule, shopifySourceInputSchema } from '.'

describe('Shopify source registration', () => {
  it('accepts a bare hostname and normalizes it to an HTTPS origin', () => {
    expect(shopifyModule.sourceRegistration.normalize({ catalogUrl: 'Example.myshopify.com' }))
      .toEqual({
        config: { catalogUrl: 'https://example.myshopify.com/' },
        sourceKey: 'example.myshopify.com',
        summary: 'example.myshopify.com',
      })
  })

  it('preserves a collection scope while removing query parameters', () => {
    expect(
      shopifyModule.sourceRegistration.normalize({
        catalogUrl: 'https://shop.example/collections/clearance/?sort_by=price-ascending',
      }),
    ).toEqual({
      config: { catalogUrl: 'https://shop.example/collections/clearance' },
      sourceKey: 'shop.example/collections/clearance',
      summary: 'shop.example/collections/clearance',
    })
  })

  it('rejects product and arbitrary page URLs as source scopes', () => {
    expect(() =>
      shopifyModule.sourceRegistration.normalize({
        catalogUrl: 'https://shop.example/products/example',
      }),
    ).toThrow('Use a Shopify storefront homepage or a single collection URL')
  })

  it('rejects non-HTTPS catalogs', () => {
    expect(() =>
      shopifyModule.sourceRegistration.normalize({ catalogUrl: 'http://example.com' }),
    ).toThrow('Catalog URL must use HTTPS')
  })

  it('rejects credentials in catalog URLs', () => {
    expect(() =>
      shopifyModule.sourceRegistration.normalize({ catalogUrl: 'https://user:pass@example.com' }),
    ).toThrow('Catalog URL cannot include credentials')
  })

  it('reports invalid input with the shared schema', () => {
    expect(shopifySourceInputSchema.safeParse({ catalogUrl: 'not a host' }).success).toBe(false)
  })

  it('validates persisted configuration before reading it', () => {
    expect(() => shopifyModule.sourceRegistration.read({ catalogUrl: 42 })).toThrow()
  })
})
