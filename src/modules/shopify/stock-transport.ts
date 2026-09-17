import { normalizeShopifyCatalogUrl } from './source-config'
import { ShopifyCollectionTransportError, type ShopifyCollectionRun, type ShopifyHttpClient, type ShopifyTransportEvent } from './transport'

const MAX_HTML_BYTES = 1_000_000

function responseHeader(response: Awaited<ReturnType<ShopifyHttpClient>>, name: string) {
  return response.headers instanceof Headers ? response.headers.get(name) ?? undefined
    : Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1]
}

function retryAfterMilliseconds(response: Awaited<ReturnType<ShopifyHttpClient>>): number | undefined {
  const value = responseHeader(response, 'retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

export interface ShopifyStockEvidencePage {
  page: number
  endpoint: string
  html: string
  capturedAt: string
}

export function shopifyStockPageUrl(catalogUrl: string, page: number): string {
  if (!Number.isInteger(page) || page < 1) throw new Error('Stock page must be a positive integer')
  const url = new URL(normalizeShopifyCatalogUrl(catalogUrl).config.catalogUrl as string)
  url.search = ''
  url.searchParams.set('page', String(page))
  return url.toString()
}

async function readBoundedHtml(response: Awaited<ReturnType<ShopifyHttpClient>>): Promise<string> {
  const length = responseHeader(response, 'content-length')
  if (length && Number(length) > MAX_HTML_BYTES) throw new ShopifyCollectionTransportError('Stock card page exceeds size limit', 'response_too_large', response.status)
  if (!response.body) {
    if (!response.text) throw new ShopifyCollectionTransportError('Stock card page had no readable HTML body', 'invalid_response', response.status)
    const html = await response.text()
    if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) throw new ShopifyCollectionTransportError('Stock card page exceeds size limit', 'response_too_large', response.status)
    return html
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      if (bytes > MAX_HTML_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new ShopifyCollectionTransportError('Stock card page exceeds size limit', 'response_too_large', response.status)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const content = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(content)
}

/** Optional collection-page HTML acquisition. It shares the JSON run budget and robots gate. */
export async function fetchShopifyStockPage(input: {
  catalogUrl: string
  page: number
  http: ShopifyHttpClient
  run: ShopifyCollectionRun
  accessPolicy: (url: string) => Promise<boolean>
  userAgent: string
  minimumDelayMs: number
  sleep?: (milliseconds: number) => Promise<void>
  onEvent?: (event: ShopifyTransportEvent) => Promise<void> | void
}) {
  const endpoint = shopifyStockPageUrl(input.catalogUrl, input.page)
  if (!(await input.accessPolicy(endpoint))) throw new ShopifyCollectionTransportError('Stock card page is disallowed by source access policy', 'persistent_rejection')
  if (input.run.requests >= input.run.maxRequests) throw new ShopifyCollectionTransportError('Collection request ceiling reached', 'request_ceiling')
  if (input.run.requests > 0) await (input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))))(input.minimumDelayMs)
  input.run.requests += 1
  await input.onEvent?.({ type: 'request_started', page: input.page, requestCount: input.run.requests })
  const response = await input.http(endpoint, {
    headers: { accept: 'text/html', 'user-agent': input.userAgent },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  })
  await input.onEvent?.({ type: 'response_received', page: input.page, requestCount: input.run.requests, status: response.status })
  if (response.status === 401 || response.status === 403) throw new ShopifyCollectionTransportError(`Stock card access rejected (${response.status})`, 'persistent_rejection', response.status)
  if (response.status === 429 || response.status === 408 || response.status === 425 || response.status >= 500) {
    const retryAfter = retryAfterMilliseconds(response)
    if (retryAfter !== undefined) throw new ShopifyCollectionTransportError(`Stock card source requested Retry-After (${response.status})`, 'retry_after', response.status, retryAfter)
    throw new ShopifyCollectionTransportError(`Stock card source returned a transient response (${response.status})`, 'deferred_backoff', response.status, 30_000)
  }
  if (response.status < 200 || response.status >= 300) throw new ShopifyCollectionTransportError(`Stock card page returned HTTP ${response.status}`, 'invalid_response', response.status)
  const contentType = responseHeader(response, 'content-type')
  if (contentType && !/^text\/html\b/iu.test(contentType)) throw new ShopifyCollectionTransportError('Stock card page was not HTML', 'invalid_response', response.status)
  return { page: input.page, endpoint, html: await readBoundedHtml(response), capturedAt: new Date().toISOString() } satisfies ShopifyStockEvidencePage
}
