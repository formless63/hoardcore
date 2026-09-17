import { describe, expect, it, vi } from 'vitest'
import { normalizeShopifyCollection, parseShopifyCollection } from './contracts'
import { collectShopifyStockSupplement } from './stock-collector'
import { createShopifyCollectionRun } from './transport'

const catalogUrl = 'https://store.invalid/collections/clearance'
const card = (quantity: string) => `<div class="product-item" id="product-1"><form class="variants"><input name="id" value="10"></form><div class="product-bottom"><div class="product-inventory"><span>${quantity}</span></div></div></div>`
const records = normalizeShopifyCollection(parseShopifyCollection({ products: [{ id: 1, title: 'Fixture', handle: 'fixture', variants: [{ id: 10, price: '1.00', available: true }] }] }),
  { sourceKey: 'store.invalid/collections/clearance', baseUrl: catalogUrl })

describe('Shopify stock-card supplement', () => {
  it('joins source-reported counts and retains raw HTML evidence with a timestamp', async () => {
    const run = createShopifyCollectionRun(3)
    run.requests = 1
    const http = vi.fn().mockResolvedValue(new Response(card('103 In stock'), { headers: { 'content-type': 'text/html' } }))
    const onPage = vi.fn()
    const result = await collectShopifyStockSupplement({ catalogUrl, records, pageCount: 1, http, run,
      accessPolicy: async () => true, userAgent: 'test', minimumDelayMs: 0, sleep: async () => {}, onPage })
    expect(result.records[0]?.listing.current.stockQuantity).toBe(103)
    expect(result.pages[0]).toMatchObject({ html: expect.stringContaining('103 In stock'), capturedAt: expect.any(String) })
    expect(onPage).toHaveBeenCalledOnce()
    expect(http).toHaveBeenCalledOnce()
  })

  it('resumes from saved HTML and leaves unknown stock null when budget is spent', async () => {
    const run = createShopifyCollectionRun(1)
    run.requests = 1
    const http = vi.fn()
    const result = await collectShopifyStockSupplement({ catalogUrl, records, pageCount: 2, http, run,
      checkpointPages: [{ page: 1, endpoint: `${catalogUrl}?page=1`, html: card('In stock'), capturedAt: '2026-09-17T00:00:00Z' }],
      accessPolicy: async () => true, userAgent: 'test', minimumDelayMs: 0 })
    expect(result.records[0]?.listing.current.stockQuantity).toBeUndefined()
    expect(result.incomplete).toContain('ceiling')
    expect(http).not.toHaveBeenCalled()
  })

  it('rejects ambiguous changed-card values rather than choosing one page arbitrarily', async () => {
    const run = createShopifyCollectionRun(2)
    run.requests = 2
    const result = await collectShopifyStockSupplement({ catalogUrl, records, pageCount: 2, http: vi.fn(), run,
      checkpointPages: [
        { page: 1, endpoint: `${catalogUrl}?page=1`, html: card('103 In stock'), capturedAt: '2026-09-17T00:00:00Z' },
        { page: 2, endpoint: `${catalogUrl}?page=2`, html: card('104 In stock'), capturedAt: '2026-09-17T00:00:01Z' },
      ], accessPolicy: async () => true, userAgent: 'test', minimumDelayMs: 0 })
    expect(result.records[0]?.listing.current.stockQuantity).toBeUndefined()
  })

  it('rejects a checkpoint attributed to another source or page', async () => {
    await expect(collectShopifyStockSupplement({ catalogUrl, records, pageCount: 1, http: vi.fn(), run: createShopifyCollectionRun(2),
      checkpointPages: [{ page: 1, endpoint: 'https://other.invalid/?page=1', html: card('9 In stock'), capturedAt: '2026-09-17T00:00:00Z' }],
      accessPolicy: async () => true, userAgent: 'test', minimumDelayMs: 0 })).rejects.toThrow('checkpoint does not match')
  })
})
