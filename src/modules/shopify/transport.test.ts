import { describe, expect, it, vi } from 'vitest'
import { createShopifyCollectionRun, fetchShopifyCollectionPage, ShopifyCollectionTransportError } from './transport'
import type { ShopifyHttpResponse } from './transport'

function response(status: number, payload: unknown = {}, headers: Record<string, string> = {}): ShopifyHttpResponse {
  return { status, headers, json: async () => payload }
}

describe('Shopify collection transport', () => {
  it('uses the collection-level JSON endpoint and stable identifiable headers', async () => {
    const http = vi.fn().mockResolvedValue(response(200, { products: [] }, { etag: '"v1"', 'last-modified': 'yesterday' }))
    const result = await fetchShopifyCollectionPage('https://store.invalid/collections/sale?sort=price', 2, undefined, {
      http,
      minimumDelayMs: 0,
      sleep: async () => {},
    })
    expect(result.endpoint).toBe('https://store.invalid/collections/sale/products.json?limit=250&page=2')
    expect(http).toHaveBeenCalledWith(result.endpoint, expect.objectContaining({
      headers: expect.objectContaining({ accept: 'application/json', 'user-agent': expect.stringContaining('Hoardcore') }),
    }))
    expect(result.cache).toMatchObject({ etag: '"v1"', lastModified: 'yesterday', payload: { products: [] } })
  })

  it('sends validators and returns not-modified without parsing a body', async () => {
    const http = vi.fn().mockResolvedValue(response(304))
    const cache = { etag: '"cached"', lastModified: 'yesterday', payload: { products: [] } }
    const result = await fetchShopifyCollectionPage('https://store.invalid', 1, cache, { http, sleep: async () => {} })
    expect(result.status).toBe('not_modified')
    expect(result.cache).toEqual(cache)
    expect(http.mock.calls[0][1].headers).toMatchObject({ 'if-none-match': '"cached"', 'if-modified-since': 'yesterday' })
  })

  it('honors Retry-After and bounds transient retries', async () => {
    const sleeps: number[] = []
    const http = vi.fn()
      .mockResolvedValueOnce(response(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(response(200, { products: [] }))
    const result = await fetchShopifyCollectionPage('https://store.invalid', 1, undefined, {
      http,
      minimumDelayMs: 0,
      sleep: async (milliseconds) => { sleeps.push(milliseconds) },
    })
    expect(result.status).toBe('ok')
    expect(sleeps).toContain(2000)
    expect(http).toHaveBeenCalledTimes(2)
  })

  it('stops immediately on persistent rejection and enforces the request ceiling', async () => {
    const reject = vi.fn().mockResolvedValue(response(403))
    await expect(fetchShopifyCollectionPage('https://store.invalid', 1, undefined, {
      http: reject,
      maxRequests: 3,
      sleep: async () => {},
    })).rejects.toMatchObject({ kind: 'persistent_rejection', status: 403 })
    expect(reject).toHaveBeenCalledTimes(1)

    const ceiling = vi.fn().mockResolvedValue(response(500))
    await expect(fetchShopifyCollectionPage('https://store.invalid', 1, undefined, {
      http: ceiling,
      maxRequests: 1,
      maxRetries: 2,
      sleep: async () => {},
    })).rejects.toBeInstanceOf(ShopifyCollectionTransportError)
    expect(ceiling).toHaveBeenCalledTimes(1)
  })

  it('shares a run budget across pages and fails closed when access policy disallows a URL', async () => {
    const http = vi.fn().mockResolvedValue(response(200, { products: [] }))
    const run = createShopifyCollectionRun(1)
    await fetchShopifyCollectionPage('https://store.invalid', 1, undefined, { http, run, sleep: async () => {} })
    await expect(fetchShopifyCollectionPage('https://store.invalid', 2, undefined, { http, run, sleep: async () => {} }))
      .rejects.toMatchObject({ kind: 'request_ceiling' })
    const denied = vi.fn().mockResolvedValue(true)
    denied.mockResolvedValueOnce(false)
    await expect(fetchShopifyCollectionPage('https://store.invalid', 1, undefined, {
      http, accessPolicy: denied, sleep: async () => {},
    })).rejects.toMatchObject({ kind: 'persistent_rejection' })
    expect(http).toHaveBeenCalledTimes(1)
  })

  it('paces sequential pages through the shared run budget', async () => {
    const sleeps: number[] = []
    const http = vi.fn().mockResolvedValue(response(200, { products: [] }))
    const run = createShopifyCollectionRun(3)

    await fetchShopifyCollectionPage('https://store.invalid', 1, undefined, {
      http,
      run,
      minimumDelayMs: 25,
      sleep: async (milliseconds) => { sleeps.push(milliseconds) },
    })
    await fetchShopifyCollectionPage('https://store.invalid', 2, undefined, {
      http,
      run,
      minimumDelayMs: 25,
      sleep: async (milliseconds) => { sleeps.push(milliseconds) },
    })

    expect(sleeps).toEqual([25])
  })

  it('reports bounded progress without exposing request URLs or payloads', async () => {
    const events: unknown[] = []
    await fetchShopifyCollectionPage('https://store.invalid/collections/sale', 1, undefined, {
      http: async () => response(200, { products: [] }),
      sleep: async () => {},
      onEvent: (event) => { events.push(event) },
    })
    expect(events).toEqual([
      { type: 'request_started', page: 1, requestCount: 1 },
      { type: 'response_received', page: 1, requestCount: 1, status: 200 },
    ])
  })

  it('fails closed when the access-policy resolver errors and proceeds when allowed', async () => {
    const http = vi.fn().mockResolvedValue(response(200, { products: [] }))
    await expect(fetchShopifyCollectionPage('https://store.invalid', 1, undefined, {
      http, accessPolicy: async () => { throw new Error('robots unavailable') }, sleep: async () => {},
    })).rejects.toMatchObject({ kind: 'persistent_rejection' })
    await expect(fetchShopifyCollectionPage('https://store.invalid', 1, undefined, {
      http, accessPolicy: async () => true, sleep: async () => {},
    })).resolves.toMatchObject({ status: 'ok' })
  })
})
