import { describe, expect, it, vi } from 'vitest'
import { collectShopifySnapshot, type ShopifyCollectionPolicy } from './collector'
import { createShopifyCollectionRun, type ShopifyHttpResponse } from './transport'
import blankOptionalFixture from './fixtures/collection-blank-optional.json'

const policy: ShopifyCollectionPolicy = {
  minimumDelayMs: 0,
  maxRequests: 3,
  maxRetries: 0,
  backoffBaseMs: 0,
  userAgent: 'Hoardcore-test/1.0',
}

function product(id: number) {
  return {
    id,
    title: `Product ${id}`,
    handle: `product-${id}`,
    variants: [{ id: id * 10, price: '10.00', available: true }],
  }
}

function response(payload: unknown, headers: Record<string, string> = {}): ShopifyHttpResponse {
  return { status: 200, headers, json: async () => payload }
}

describe('Shopify collection snapshot orchestration', () => {
  it('merges sequential pages and retains first-page cache metadata', async () => {
    const firstPage = { products: Array.from({ length: 250 }, (_, index) => product(index + 1)) }
    const secondPage = { products: [product(251)] }
    const http = vi.fn()
      .mockResolvedValueOnce(response(firstPage, { etag: '"page-one"' }))
      .mockResolvedValueOnce(response(secondPage, { etag: '"page-two"' }))

    const result = await collectShopifySnapshot({
      catalogUrl: 'https://store.invalid/collections/sale',
      sourceKey: 'store.invalid/collections/sale',
      policy,
      http,
      accessPolicy: async () => true,
      sleep: async () => {},
      observedAt: '2026-09-16T00:00:00.000Z',
    })

    expect(result).toMatchObject({ status: 'ok', requestCount: 2, cache: { etag: '"page-one"' } })
    if (result.status !== 'ok') throw new Error('Expected a complete snapshot')
    expect(result.records).toHaveLength(251)
    expect((result.evidencePayload as { pages: unknown[] }).pages).toHaveLength(2)
    expect(http).toHaveBeenCalledTimes(2)
  })

  it('preserves validators across a not-modified snapshot', async () => {
    const http = vi.fn().mockResolvedValue({ status: 304, headers: {}, json: async () => ({}) })
    const cache = { etag: '"cached"', lastModified: 'yesterday' }
    const result = await collectShopifySnapshot({
      catalogUrl: 'https://store.invalid',
      sourceKey: 'store.invalid',
      cache,
      policy,
      http,
      accessPolicy: async () => true,
      sleep: async () => {},
    })

    expect(result).toEqual({ status: 'not_modified', cache, requestCount: 1 })
  })

  it('continues from cached page one after a 304 when it may have later pages', async () => {
    const cachedFirstPage = { products: Array.from({ length: 250 }, (_, index) => product(index + 1)) }
    const secondPage = { products: [product(251)] }
    const http = vi.fn()
      .mockResolvedValueOnce({ status: 304, headers: {}, json: async () => ({}) })
      .mockResolvedValueOnce(response(secondPage))

    const result = await collectShopifySnapshot({
      catalogUrl: 'https://store.invalid/collections/sale',
      sourceKey: 'store.invalid/collections/sale',
      cache: { etag: '"cached"', payload: cachedFirstPage },
      policy,
      http,
      accessPolicy: async () => true,
      sleep: async () => {},
    })

    expect(result).toMatchObject({ status: 'ok', requestCount: 2, pageCount: 2, productCount: 251 })
    if (result.status === 'not_modified') throw new Error('Expected a snapshot')
    expect(result.records).toHaveLength(251)
    expect(http.mock.calls[1]?.[0]).toContain('page=2')
  })

  it('retains raw blank optional fields as evidence while normalizing them away', async () => {
    const result = await collectShopifySnapshot({
      catalogUrl: 'https://store.invalid/collections/sale',
      sourceKey: 'store.invalid/collections/sale',
      policy,
      http: async () => response(blankOptionalFixture),
      accessPolicy: async () => true,
      sleep: async () => {},
    })

    expect(result.status).toBe('ok')
    if (result.status === 'not_modified') throw new Error('Expected a snapshot')
    expect(result.records[0]?.product.productType).toBeUndefined()
    expect((result.evidencePayload as { pages: typeof blankOptionalFixture[] }).pages[0]?.products[0]?.product_type).toBe('')
  })

  it('returns a marked partial snapshot when the shared ceiling is reached', async () => {
    const fullPage = { products: Array.from({ length: 250 }, (_, index) => product(index + 1)) }
    const http = vi.fn().mockResolvedValue(response(fullPage))
    const run = createShopifyCollectionRun(1)

    const result = await collectShopifySnapshot({
      catalogUrl: 'https://store.invalid',
      sourceKey: 'store.invalid',
      policy: { ...policy, maxRequests: 1 },
      http,
      accessPolicy: async () => true,
      run,
      sleep: async () => {},
    })
    expect(result).toMatchObject({ status: 'partial', requestCount: 1, pageCount: 1, productCount: 250 })
    if (result.status === 'not_modified') throw new Error('Expected a partial snapshot')
    expect(result.records).toHaveLength(250)
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('saves prior valid pages as partial when a later page fails validation', async () => {
    const firstPage = { products: Array.from({ length: 250 }, (_, index) => product(index + 1)) }
    const rejectedPage = { products: [{ id: 251, title: '', handle: 'invalid', variants: [{ id: 2510 }] }] }
    const http = vi.fn()
      .mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response(rejectedPage))

    const result = await collectShopifySnapshot({
      catalogUrl: 'https://store.invalid/collections/sale',
      sourceKey: 'store.invalid/collections/sale',
      policy,
      http,
      accessPolicy: async () => true,
      sleep: async () => {},
    })

    expect(result).toMatchObject({
      status: 'partial', requestCount: 2, pageCount: 1, productCount: 250,
      incomplete: { kind: 'invalid_page', page: 2 },
    })
    if (result.status === 'not_modified') throw new Error('Expected a partial snapshot')
    expect(result.records).toHaveLength(250)
    expect(result.evidencePayload).toMatchObject({ rejectedPage })
    expect(http).toHaveBeenCalledTimes(2)
  })
})
