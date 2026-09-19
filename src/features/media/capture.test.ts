import { describe, expect, it } from 'vitest'
import { createImageDerivatives, createMediaRobotsAccessPolicy, fetchMediaBytes, MediaCaptureError } from './capture.server'
import { mediaCandidateKey } from './media.server'
import { isAllowedShopifyMediaUrl, usesOperatorApprovedShopifyAccess } from '~/modules/shopify/media-policy'

const policy = { enabled: true, requestLimit: 5, concurrency: 3, minimumDelayMs: 1, maxRetries: 1, userAgent: 'Hoardcore test' }
const onePixelPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))

function response(status: number, body = onePixelPng, headers: Record<string, string> = { 'content-type': 'image/png' }) {
  return {
    status, ok: status >= 200 && status < 300, headers,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    text: async () => 'User-agent: *\nAllow: /',
  }
}

describe('media capture safety', () => {
  it('uses a JSONB-safe continuation cursor', () => {
    const cursor = mediaCandidateKey({ listingId: '00000000-0000-0000-0000-000000000001', sourceUrl: 'https://cdn.shopify.com/a.jpg' })
    expect(cursor).not.toContain('\u0000')
    expect(JSON.parse(JSON.stringify({ after: cursor }))).toEqual({ after: cursor })
  })

  it('accepts only module-approved Shopify media hosts', () => {
    const config = { catalogUrl: 'https://demo.example/collections/sale' }
    expect(isAllowedShopifyMediaUrl(config, 'https://demo.example/a.jpg')).toBe(true)
    expect(isAllowedShopifyMediaUrl(config, 'https://cdn.shopify.com/a.jpg')).toBe(true)
    expect(isAllowedShopifyMediaUrl(config, 'https://elsewhere.example/a.jpg')).toBe(false)
    expect(isAllowedShopifyMediaUrl(config, 'http://cdn.shopify.com/a.jpg')).toBe(false)
  })

  it('requires explicit operator approval before skipping media preflights', () => {
    expect(usesOperatorApprovedShopifyAccess({ catalogUrl: 'https://demo.example/collections/sale' })).toBe(false)
    expect(usesOperatorApprovedShopifyAccess({ catalogUrl: 'https://demo.example/collections/sale', robotsPolicy: 'operator_approved' })).toBe(true)
  })

  it('requires robots permission and counts the robots request', async () => {
    const calls: string[] = []
    const budget = { requests: 0, maxRequests: 3 }
    const access = createMediaRobotsAccessPolicy(budget, async (url) => {
      calls.push(url)
      return response(200)
    }, 'Hoardcore test', 1, async () => {})
    expect(await access('https://cdn.shopify.com/path/image.jpg')).toBe(true)
    expect(calls).toEqual(['https://cdn.shopify.com/robots.txt'])
    expect(budget.requests).toBe(1)
  })

  it('shares one robots check across concurrent images on the same origin', async () => {
    const calls: string[] = []
    const budget = { requests: 0, maxRequests: 3 }
    const access = createMediaRobotsAccessPolicy(budget, async (url) => {
      calls.push(url)
      return response(200)
    }, 'Hoardcore test', 1, async () => {})
    expect(await Promise.all([
      access('https://cdn.shopify.com/one.jpg'),
      access('https://cdn.shopify.com/two.jpg'),
    ])).toEqual([true, true])
    expect(calls).toHaveLength(1)
    expect(budget.requests).toBe(1)
  })

  it('paces concurrent request starts and never exceeds the shared ceiling', async () => {
    const budget = { requests: 0, maxRequests: 2 }
    let active = 0
    let maximumActive = 0
    let waits = 0
    const http = async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return response(200)
    }
    const results = await Promise.allSettled([1, 2, 3].map((number) =>
      fetchMediaBytes(`https://cdn.shopify.com/${number}.jpg`, policy, budget, http, {
        accessPolicy: async () => true,
        wait: async () => { waits += 1 },
      })))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(maximumActive).toBe(2)
    expect(waits).toBe(1)
    expect(budget.requests).toBe(2)
  })

  it('honors a retry response without exceeding the explicit ceiling', async () => {
    const budget = { requests: 0, maxRequests: 3 }
    let calls = 0
    const acquired = await fetchMediaBytes('https://cdn.shopify.com/path/image.jpg', policy, budget, async () => {
      calls += 1
      return calls === 1 ? response(429, onePixelPng, { 'retry-after': '0' }) : response(200)
    }, { accessPolicy: async () => true, wait: async () => {} })
    expect(acquired.contentType).toBe('image/png')
    expect(calls).toBe(2)
    expect(budget.requests).toBe(2)
  })

  it('halts the batch after a persistent access rejection', async () => {
    const budget = { requests: 0, maxRequests: 5, stopped: false }
    const http = async () => response(403)
    await expect(fetchMediaBytes('https://cdn.shopify.com/rejected.jpg', policy, budget, http, {
      accessPolicy: async () => true, wait: async () => {},
    })).rejects.toMatchObject({ kind: 'persistent_rejection' } satisfies Partial<MediaCaptureError>)
    expect(budget.stopped).toBe(true)
    await expect(fetchMediaBytes('https://cdn.shopify.com/another.jpg', policy, budget, http, {
      accessPolicy: async () => true, wait: async () => {},
    })).rejects.toMatchObject({ kind: 'persistent_rejection' } satisfies Partial<MediaCaptureError>)
    expect(budget.requests).toBe(1)
  })

  it('does not follow redirects or accept non-images', async () => {
    await expect(fetchMediaBytes('https://cdn.shopify.com/path/image.jpg', policy, { requests: 0, maxRequests: 2 }, async () => response(302), { accessPolicy: async () => true, wait: async () => {} }))
      .rejects.toMatchObject({ kind: 'invalid_response' } satisfies Partial<MediaCaptureError>)
    await expect(fetchMediaBytes('https://cdn.shopify.com/path/image.jpg', policy, { requests: 0, maxRequests: 2 }, async () => response(200, onePixelPng, { 'content-type': 'text/html' }), { accessPolicy: async () => true, wait: async () => {} }))
      .rejects.toMatchObject({ kind: 'invalid_response' } satisfies Partial<MediaCaptureError>)
  })

  it('stops an oversized streamed image before buffering the full body', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1)) } })
    await expect(fetchMediaBytes('https://cdn.shopify.com/path/image.jpg', policy, { requests: 0, maxRequests: 2 }, async () => ({ ...response(200), body, arrayBuffer: async () => { throw new Error('arrayBuffer must not be used') } }), { accessPolicy: async () => true, wait: async () => {} }))
      .rejects.toMatchObject({ kind: 'invalid_response' } satisfies Partial<MediaCaptureError>)
  })

  it('rejects local and credential-bearing image URLs before a request', async () => {
    const http = async () => { throw new Error('network must not be called') }
    await expect(fetchMediaBytes('https://user:secret@cdn.shopify.com/a.jpg', policy, { requests: 0, maxRequests: 2 }, http, { accessPolicy: async () => true, wait: async () => {} }))
      .rejects.toMatchObject({ kind: 'source_url_rejected' } satisfies Partial<MediaCaptureError>)
    await expect(fetchMediaBytes('https://127.0.0.1/a.jpg', policy, { requests: 0, maxRequests: 2 }, http, { accessPolicy: async () => true, wait: async () => {} }))
      .rejects.toMatchObject({ kind: 'source_url_rejected' } satisfies Partial<MediaCaptureError>)
  })

  it('creates small WebP thumbnail and preview derivatives', async () => {
    const derivatives = await createImageDerivatives(onePixelPng)
    expect(derivatives.thumbnail.contentType).toBe('image/webp')
    expect(derivatives.preview.contentType).toBe('image/webp')
    expect(derivatives.thumbnail.width).toBeLessThanOrEqual(96)
    expect(derivatives.preview.width).toBeLessThanOrEqual(480)
  })
})
