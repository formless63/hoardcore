import { describe, expect, it, vi } from 'vitest'
import { createShopifyCollectionRun } from './transport'
import { fetchShopifyStockPage, shopifyStockPageUrl } from './stock-transport'

const catalogUrl = 'https://store.invalid/collections/clearance'
const html = '<div class="product-item" id="product-1"></div>'

describe('optional Shopify stock-card transport', () => {
  it('fetches only a bounded collection HTML page with shared budget, robots, and pacing', async () => {
    const run = createShopifyCollectionRun(3)
    run.requests = 1
    const policy = vi.fn().mockResolvedValue(true)
    const sleep = vi.fn().mockResolvedValue(undefined)
    const http = vi.fn().mockResolvedValue(new Response(html, { headers: { 'content-type': 'text/html' } }))
    const result = await fetchShopifyStockPage({ catalogUrl, page: 2, http, run, accessPolicy: policy,
      userAgent: 'Hoardcore-test/1.0', minimumDelayMs: 1000, sleep })
    expect(result).toMatchObject({ page: 2, html, endpoint: `${catalogUrl}?page=2`, capturedAt: expect.any(String) })
    expect(policy).toHaveBeenCalledWith(`${catalogUrl}?page=2`)
    expect(http).toHaveBeenCalledWith(`${catalogUrl}?page=2`, expect.objectContaining({
      headers: { accept: 'text/html', 'user-agent': 'Hoardcore-test/1.0' }, redirect: 'error',
    }))
    expect(sleep).toHaveBeenCalledWith(1000)
    expect(run.requests).toBe(2)
  })

  it('does not issue HTML when robots denies or the shared ceiling is exhausted', async () => {
    const http = vi.fn()
    await expect(fetchShopifyStockPage({ catalogUrl, page: 1, http, run: createShopifyCollectionRun(2),
      accessPolicy: async () => false, userAgent: 'test', minimumDelayMs: 0 })).rejects.toMatchObject({ kind: 'persistent_rejection' })
    const run = createShopifyCollectionRun(1)
    run.requests = 1
    await expect(fetchShopifyStockPage({ catalogUrl, page: 1, http, run,
      accessPolicy: async () => true, userAgent: 'test', minimumDelayMs: 0 })).rejects.toMatchObject({ kind: 'request_ceiling' })
    expect(http).not.toHaveBeenCalled()
  })

  it('rejects redirects, non-HTML, and oversized bodies without parsing stock', async () => {
    const base = { catalogUrl, page: 1, accessPolicy: async () => true, userAgent: 'test', minimumDelayMs: 0 }
    await expect(fetchShopifyStockPage({ ...base, run: createShopifyCollectionRun(),
      http: async () => new Response(null, { status: 302 }) })).rejects.toMatchObject({ kind: 'invalid_response', status: 302 })
    await expect(fetchShopifyStockPage({ ...base, run: createShopifyCollectionRun(),
      http: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }) })).rejects.toMatchObject({ kind: 'invalid_response' })
    await expect(fetchShopifyStockPage({ ...base, run: createShopifyCollectionRun(),
      http: async () => new Response('x', { headers: { 'content-type': 'text/html', 'content-length': '1000001' } }) })).rejects.toMatchObject({ kind: 'response_too_large' })
  })

  it('honors source Retry-After and defers transient failures without an inline retry', async () => {
    const base = { catalogUrl, page: 1, accessPolicy: async () => true, userAgent: 'test', minimumDelayMs: 0 }
    const throttled = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '120' } }))
    await expect(fetchShopifyStockPage({ ...base, run: createShopifyCollectionRun(), http: throttled })).rejects.toMatchObject({
      kind: 'retry_after', status: 429, retryAfterMs: 120_000,
    })
    expect(throttled).toHaveBeenCalledOnce()
    const transient = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    await expect(fetchShopifyStockPage({ ...base, run: createShopifyCollectionRun(), http: transient })).rejects.toMatchObject({
      kind: 'deferred_backoff', status: 503, retryAfterMs: 30_000,
    })
    expect(transient).toHaveBeenCalledOnce()
  })

  it('never constructs product-detail URLs', () => {
    expect(shopifyStockPageUrl(catalogUrl, 3)).toBe(`${catalogUrl}?page=3`)
    expect(() => shopifyStockPageUrl(catalogUrl, 0)).toThrow()
  })
})
