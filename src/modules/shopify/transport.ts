import { normalizeShopifyCatalogUrl } from './source-config'

export interface ShopifyHttpResponse {
  status: number
  headers: Headers | Readonly<Record<string, string | undefined>>
  body?: ReadableStream<Uint8Array> | null
  json(): Promise<unknown>
}

export type ShopifyHttpClient = (url: string, init: {
  headers: Record<string, string>
  redirect: 'error'
  signal?: AbortSignal
}) => Promise<ShopifyHttpResponse>

export interface ShopifyCacheEntry {
  etag?: string
  lastModified?: string
  payload?: unknown
}

export interface ShopifyTransportOptions {
  http: ShopifyHttpClient
  userAgent?: string
  minimumDelayMs?: number
  maxRequests?: number
  maxRetries?: number
  backoffBaseMs?: number
  /** Per-request deadline. A stalled source must not occupy a worker forever. */
  requestTimeoutMs?: number
  /** Maximum response body accepted from a collection endpoint. */
  maxResponseBytes?: number
  /** Long source-directed backoffs are deferred to the durable worker queue. */
  maxInlineRetryAfterMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  signal?: AbortSignal
  accessPolicy?: (url: string) => Promise<boolean>
  run?: ShopifyCollectionRun
  onEvent?: (event: ShopifyTransportEvent) => Promise<void> | void
}

export type ShopifyTransportEvent =
  | { type: 'request_started'; page: number; requestCount: number }
  | { type: 'response_received'; page: number; requestCount: number; status: number }

export interface ShopifyCollectionRun {
  requests: number
  maxRequests: number
}

export function createShopifyCollectionRun(maxRequests = 3): ShopifyCollectionRun {
  if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new Error('Collection request ceiling must be positive')
  return { requests: 0, maxRequests }
}

export interface ShopifyCollectionFetchResult {
  status: 'ok' | 'not_modified'
  endpoint: string
  payload?: unknown
  cache: ShopifyCacheEntry
  requests: number
}

export class ShopifyCollectionTransportError extends Error {
  constructor(
    message: string,
    readonly kind: 'request_ceiling' | 'persistent_rejection' | 'retry_exhausted' | 'invalid_response' | 'redirect_rejected' | 'response_too_large' | 'timeout' | 'retry_after' | 'deferred_backoff',
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'ShopifyCollectionTransportError'
  }
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
const defaultRequestTimeoutMs = 15_000
const defaultMaxResponseBytes = 5 * 1024 * 1024
const defaultMaxInlineRetryAfterMs = 30_000

function header(response: ShopifyHttpResponse, name: string): string | undefined {
  const headers = response.headers
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
}

function retryAfterMs(response: ShopifyHttpResponse, now = Date.now()): number | undefined {
  const value = header(response, 'retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

function endpointFor(catalogUrl: string, page: number): string {
  const normalized = normalizeShopifyCatalogUrl(catalogUrl).config.catalogUrl as string
  const url = new URL(normalized)
  const path = url.pathname === '/' ? '/products.json' : `${url.pathname}/products.json`
  url.pathname = path
  url.search = ''
  url.searchParams.set('limit', '250')
  url.searchParams.set('page', String(page))
  return url.toString()
}

async function readJsonPayload(response: ShopifyHttpResponse, maxResponseBytes: number): Promise<unknown> {
  const contentLength = header(response, 'content-length')
  if (contentLength && Number(contentLength) > maxResponseBytes) {
    throw new ShopifyCollectionTransportError('Shopify collection response exceeds the configured size limit', 'response_too_large', response.status)
  }

  // Native fetch responses expose a stream. Enforce the cap while reading so
  // a false/missing Content-Length cannot make the worker retain an unbounded
  // payload. The `json` fallback keeps fixture HTTP clients simple.
  if (!response.body) return response.json()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxResponseBytes) {
        await reader.cancel().catch(() => undefined)
        throw new ShopifyCollectionTransportError('Shopify collection response exceeds the configured size limit', 'response_too_large', response.status)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Fetches one collection-level Shopify page. Parsing and persistence are separate stages. */
export async function fetchShopifyCollectionPage(
  catalogUrl: string,
  page: number,
  cache: ShopifyCacheEntry | undefined,
  options: ShopifyTransportOptions,
): Promise<ShopifyCollectionFetchResult> {
  const maxRequests = options.maxRequests ?? 3
  const maxRetries = options.maxRetries ?? 2
  const minimumDelayMs = options.minimumDelayMs ?? 1000
  const backoffBaseMs = options.backoffBaseMs ?? 1000
  const requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs
  const maxResponseBytes = options.maxResponseBytes ?? defaultMaxResponseBytes
  const maxInlineRetryAfterMs = options.maxInlineRetryAfterMs ?? defaultMaxInlineRetryAfterMs
  const sleep = options.sleep ?? defaultSleep
  if (maxRequests < 1) throw new ShopifyCollectionTransportError('Collection request ceiling must be positive', 'request_ceiling')
  if (page < 1 || !Number.isInteger(page)) throw new Error('Collection page must be a positive integer')
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new Error('Collection request timeout must be positive')
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1) throw new Error('Collection response size limit must be positive')
  if (!Number.isFinite(maxInlineRetryAfterMs) || maxInlineRetryAfterMs < 0) throw new Error('Maximum inline Retry-After delay must be nonnegative')

  const endpoint = endpointFor(catalogUrl, page)
  if (options.accessPolicy) {
    try {
      if (!(await options.accessPolicy(endpoint))) {
        throw new ShopifyCollectionTransportError('Collection access is disallowed by the source access policy', 'persistent_rejection')
      }
    } catch (error) {
      if (error instanceof ShopifyCollectionTransportError) throw error
      throw new ShopifyCollectionTransportError('Collection access policy could not be determined', 'persistent_rejection')
    }
  }
  const run = options.run ?? createShopifyCollectionRun(maxRequests)
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': options.userAgent ?? 'Hoardcore/0.1 (conservative catalog collector)',
  }
  if (cache?.etag) headers['if-none-match'] = cache.etag
  if (cache?.lastModified) headers['if-modified-since'] = cache.lastModified

  let requests = 0
  let attempt = 0
  while (true) {
    if (requests >= maxRequests || run.requests >= run.maxRequests) {
      throw new ShopifyCollectionTransportError('Collection request ceiling reached', 'request_ceiling')
    }
    // Pace every acquisition after the first source request in this run,
    // including requests made by a prior page or the robots policy check.
    if (run.requests > 0) await sleep(minimumDelayMs)
    if (options.signal?.aborted) throw new Error('Collection request aborted')
    requests += 1
    run.requests += 1
    await options.onEvent?.({ type: 'request_started', page, requestCount: run.requests })
    const timeout = AbortSignal.timeout(requestTimeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    let response: ShopifyHttpResponse
    try {
      response = await options.http(endpoint, { headers, redirect: 'error', signal })
    } catch (cause) {
      if (timeout.aborted && !options.signal?.aborted) {
        throw new ShopifyCollectionTransportError(`Shopify collection request timed out after ${requestTimeoutMs}ms`, 'timeout')
      }
      throw cause
    }
    await options.onEvent?.({ type: 'response_received', page, requestCount: run.requests, status: response.status })

    if (response.status === 304) {
      return { status: 'not_modified', endpoint, cache: { ...cache }, requests }
    }
    if (response.status >= 300 && response.status < 400) {
      throw new ShopifyCollectionTransportError(`Shopify collection redirect rejected (${response.status})`, 'redirect_rejected', response.status)
    }
    if (response.status === 401 || response.status === 403) {
      throw new ShopifyCollectionTransportError(`Shopify rejected collection access (${response.status})`, 'persistent_rejection', response.status)
    }
    const transient = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500
    if (transient) {
      if (attempt >= maxRetries) {
        throw new ShopifyCollectionTransportError(`Shopify request retries exhausted (${response.status})`, 'retry_exhausted', response.status)
      }
      const sourceRetryAfterMs = retryAfterMs(response)
      if (sourceRetryAfterMs !== undefined && sourceRetryAfterMs > maxInlineRetryAfterMs) {
        throw new ShopifyCollectionTransportError(
          `Shopify requested a ${sourceRetryAfterMs}ms retry delay; collection was deferred without retrying early`,
          'retry_after',
          response.status,
          sourceRetryAfterMs,
        )
      }
      const delay = sourceRetryAfterMs ?? backoffBaseMs * 2 ** attempt
      if (sourceRetryAfterMs === undefined && delay > maxInlineRetryAfterMs) {
        throw new ShopifyCollectionTransportError(
          `Transient source response (${response.status}); collection deferred for ${delay}ms before another attempt`,
          'deferred_backoff', response.status, delay,
        )
      }
      attempt += 1
      await sleep(delay)
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ShopifyCollectionTransportError(`Shopify collection request failed (${response.status})`, 'invalid_response', response.status)
    }
    const payload = await readJsonPayload(response, maxResponseBytes)
    return {
      status: 'ok',
      endpoint,
      payload,
      cache: { etag: header(response, 'etag'), lastModified: header(response, 'last-modified'), payload },
      requests,
    }
  }
}
