import { describe, expect, it } from 'vitest'
import { createImageDerivatives, createMediaRobotsAccessPolicy, fetchMediaBytes, MediaCaptureError } from './capture.server'
import { isAllowedShopifyMediaUrl } from '~/modules/shopify/media-policy'

const policy = { enabled: true, requestLimit: 5, minimumDelayMs: 1, maxRetries: 1, userAgent: 'Hoardcore test' }
const onePixelPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))

function response(status: number, body = onePixelPng, headers: Record<string, string> = { 'content-type': 'image/png' }) {
  return {
    status, ok: status >= 200 && status < 300, headers,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    text: async () => 'User-agent: *\nAllow: /',
  }
}

describe('media capture safety', () => {
  it('accepts only module-approved Shopify media hosts', () => {
    const config = { catalogUrl: 'https://demo.example/collections/sale' }
    expect(isAllowedShopifyMediaUrl(config, 'https://demo.example/a.jpg')).toBe(true)
    expect(isAllowedShopifyMediaUrl(config, 'https://cdn.shopify.com/a.jpg')).toBe(true)
    expect(isAllowedShopifyMediaUrl(config, 'https://elsewhere.example/a.jpg')).toBe(false)
    expect(isAllowedShopifyMediaUrl(config, 'http://cdn.shopify.com/a.jpg')).toBe(false)
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
      .rejects.toMatchObject({ kind: 'access_denied' } satisfies Partial<MediaCaptureError>)
    await expect(fetchMediaBytes('https://127.0.0.1/a.jpg', policy, { requests: 0, maxRequests: 2 }, http, { accessPolicy: async () => true, wait: async () => {} }))
      .rejects.toMatchObject({ kind: 'access_denied' } satisfies Partial<MediaCaptureError>)
  })

  it('creates small WebP thumbnail and preview derivatives', async () => {
    const derivatives = await createImageDerivatives(onePixelPng)
    expect(derivatives.thumbnail.contentType).toBe('image/webp')
    expect(derivatives.preview.contentType).toBe('image/webp')
    expect(derivatives.thumbnail.width).toBeLessThanOrEqual(96)
    expect(derivatives.preview.width).toBeLessThanOrEqual(480)
  })
})
