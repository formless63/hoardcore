import { describe, expect, it } from 'vitest'
import { shopifyModule, shopifySourceInputSchema } from '.'
import validFixture from './fixtures/collection-valid.json'
import partialFixture from './fixtures/collection-partial.json'
import blankOptionalFixture from './fixtures/collection-blank-optional.json'
import malformedFixture from './fixtures/collection-malformed.json'
import { normalizeShopifyCollection, parseShopifyCollection } from './contracts'

describe('Shopify source registration', () => {
  it('accepts a bare hostname and normalizes it to an HTTPS origin', () => {
    expect(shopifyModule.sourceRegistration.normalize({ catalogUrl: 'Example.myshopify.com' }))
      .toEqual({
        config: { catalogUrl: 'https://example.myshopify.com/', minimumDelayMs: 1000, maxRequests: 3, maxRetries: 2, backoffBaseMs: 1000, userAgent: 'Hoardcore/0.1 (conservative catalog collector)' },
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
      config: { catalogUrl: 'https://shop.example/collections/clearance', minimumDelayMs: 1000, maxRequests: 3, maxRetries: 2, backoffBaseMs: 1000, userAgent: 'Hoardcore/0.1 (conservative catalog collector)' },
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

  it('parses and normalizes a collection fixture into shared product, variant, and listing records', () => {
    const parsed = parseShopifyCollection(validFixture)
    const records = normalizeShopifyCollection(parsed, {
      sourceKey: 'catalog-a.example/collections/desk',
      baseUrl: 'https://catalog-a.example',
      observedAt: '2026-09-16T12:00:00.000Z',
    })

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      product: { productKey: 'shopify:catalog-a.example:product:101', title: 'Field Notebook', tags: ['paper', 'field'] },
      variant: { variantKey: 'shopify:catalog-a.example:product:101:variant:1001', price: 12.5, available: true },
      listing: {
        listingKey: 'catalog-a.example/collections/desk:shopify:catalog-a.example:product:101:variant:1001',
        sourceKey: 'catalog-a.example/collections/desk',
        url: 'https://catalog-a.example/products/field-notebook?variant=1001',
      },
    })
    expect(records[1].product.description).toBeUndefined()
    expect(records[1].product.tags).toEqual(['ceramic', 'kitchen'])
  })

  it('accepts partial products while preserving safe defaults and stable keys', () => {
    const records = normalizeShopifyCollection(parseShopifyCollection(partialFixture), {
      sourceKey: 'catalog-b.example',
      baseUrl: 'https://catalog-b.example/',
    })
    expect(records[0]).toMatchObject({
      product: { productKey: 'shopify:catalog-b.example:product:303', title: 'Incomplete Product', tags: [] },
      variant: { variantKey: 'shopify:catalog-b.example:product:303:variant:3001', available: false },
      listing: { listingKey: 'catalog-b.example:shopify:catalog-b.example:product:303:variant:3001' },
    })
  })

  it('normalizes blank and null optional metadata without rejecting a page', () => {
    const parsed = parseShopifyCollection(blankOptionalFixture)
    const records = normalizeShopifyCollection(parsed, {
      sourceKey: 'fixture.example/collections/sale',
      baseUrl: 'https://fixture.example',
    })

    expect(parsed.products[0]?.product_type).toBeUndefined()
    expect(records).toHaveLength(2)
    expect(records[0]?.product).toMatchObject({ title: 'Fixture Relay', tags: [] })
    expect(records[0]?.product.brand).toBeUndefined()
    expect(records[0]?.product.productType).toBeUndefined()
    expect(records[0]?.product.description).toBeUndefined()
    expect(records[0]?.variant.sku).toBeUndefined()
    expect(records[0]?.variant.barcode).toBeUndefined()
    expect(records[0]?.listing.imageUrl).toBeUndefined()
    expect(records[1]?.product.productType).toBeUndefined()
  })

  it('rejects malformed source payloads at the trust boundary', () => {
    expect(() => parseShopifyCollection(malformedFixture)).toThrow()
    expect(() => parseShopifyCollection({ products: [{ id: 1, title: '', handle: 'bad', variants: [] }] })).toThrow()
  })

  it('keeps the same Shopify module reusable across independent source scopes', () => {
    const parsed = parseShopifyCollection(partialFixture)
    const first = normalizeShopifyCollection(parsed, { sourceKey: 'one.invalid', baseUrl: 'https://one.invalid' })
    const second = normalizeShopifyCollection(parsed, { sourceKey: 'two.invalid/collections/a', baseUrl: 'https://two.invalid' })
    expect(first[0].listing.listingKey).not.toBe(second[0].listing.listingKey)
    expect(first[0].product.productKey).not.toBe(second[0].product.productKey)
  })

  it('shares product identity across collection scopes on one storefront', () => {
    const parsed = parseShopifyCollection(partialFixture)
    const first = normalizeShopifyCollection(parsed, { sourceKey: 'one.invalid/collections/a', baseUrl: 'https://one.invalid' })
    const second = normalizeShopifyCollection(parsed, { sourceKey: 'one.invalid/collections/b', baseUrl: 'https://one.invalid/' })
    expect(first[0].product.productKey).toBe(second[0].product.productKey)
    expect(first[0].variant.variantKey).toBe(second[0].variant.variantKey)
    expect(first[0].listing.listingKey).not.toBe(second[0].listing.listingKey)
  })
})
