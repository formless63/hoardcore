import { describe, expect, it, vi } from 'vitest'
import { collectShopifySnapshot, type ShopifyCollectionPolicy } from './collector'
import { createShopifyCollectionRun, type ShopifyHttpResponse } from './transport'

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
    expect((result.evidencePayload as { products: unknown[] }).products).toHaveLength(251)
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
})
