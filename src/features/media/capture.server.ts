import { eq } from 'drizzle-orm'
import robotsParser from 'robots-parser'
import sharp from 'sharp'
import type { Database } from '~/server/db/db.server'
import { catalogSources } from '~/server/db/schema/catalog-sources'
import { mediaCaptureRuns, listingMedia } from '~/server/db/schema/media'
import { isAllowedShopifyMediaUrl } from '~/modules/shopify/media-policy'
import { mediaCapturePolicySchema, type MediaCapturePolicy } from './media.schemas'
import { getCaptureCandidate, listSourceMediaCandidates, mediaCandidateKey, persistListingMedia, reuseListingMedia } from './media.server'

const maxImageBytes = 10 * 1024 * 1024
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

export interface MediaHttpResponse {
  status: number
  ok: boolean
  headers: Headers | Readonly<Record<string, string | undefined>>
  body?: ReadableStream<Uint8Array> | null
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
}

export type MediaHttpClient = (url: string, init: RequestInit) => Promise<MediaHttpResponse>

export interface MediaRequestBudget {
  requests: number
  maxRequests: number
  stopped?: boolean
  cooldownUntil?: number
}

export class MediaCaptureError extends Error {
  constructor(message: string, readonly kind: 'access_denied' | 'source_url_rejected' | 'request_ceiling' | 'persistent_rejection' | 'retry_exhausted' | 'invalid_response') {
    super(message)
    this.name = 'MediaCaptureError'
  }
}

function getHeader(headers: MediaHttpResponse['headers'], name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
}

function retryAfterMs(response: MediaHttpResponse): number | undefined {
  const value = getHeader(response.headers, 'retry-after')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

function assertPublicHttpsUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new MediaCaptureError('Image URL is invalid', 'source_url_rejected') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new MediaCaptureError('Image URL must be credential-free HTTPS', 'source_url_rejected')
  // Literal local/private IPs are never valid media origins. Hostname allowlisting
  // prevents arbitrary public hosts too; deployments should use a controlled DNS
  // resolver if they need protection against hostile DNS records.
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(url.hostname) || url.hostname.includes(':')) {
    throw new MediaCaptureError('Image URL host is not a permitted public hostname', 'source_url_rejected')
  }
  return url
}

// Only request starts are serialized. Responses and image decoding can overlap.
const requestReservations = new WeakMap<MediaRequestBudget, Promise<void>>()
async function reserveRequest(budget: MediaRequestBudget, delayMs: number, wait: (milliseconds: number) => Promise<void>) {
  const previous = requestReservations.get(budget) ?? Promise.resolve()
  let release!: () => void
  const reservation = new Promise<void>((resolve) => { release = resolve })
  requestReservations.set(budget, reservation)
  await previous
  try {
    if (budget.stopped) throw new MediaCaptureError('Media requests stopped after source rejection', 'persistent_rejection')
    if (budget.requests >= budget.maxRequests) throw new MediaCaptureError('Media request ceiling reached', 'request_ceiling')
    if (budget.requests > 0) await wait(Math.max(delayMs, (budget.cooldownUntil ?? 0) - Date.now()))
    budget.requests += 1
  } finally {
    release()
  }
}

/** Conservative robots policy with a per-origin cache. A failed check denies access. */
export function createMediaRobotsAccessPolicy(
  budget: MediaRequestBudget,
  http: MediaHttpClient,
  userAgent: string,
  minimumDelayMs: number,
  wait: (milliseconds: number) => Promise<void> = sleep,
) {
  const cache = new Map<string, Promise<ReturnType<typeof robotsParser> | null>>()
  return async (url: string) => {
    const candidate = assertPublicHttpsUrl(url)
    const origin = candidate.origin
    let check = cache.get(origin)
    if (!check) {
      check = (async () => {
        await reserveRequest(budget, minimumDelayMs, wait)
        try {
          const response = await http(`${origin}/robots.txt`, { headers: { accept: 'text/plain', 'user-agent': userAgent }, redirect: 'manual', signal: AbortSignal.timeout(5_000) })
          return response.ok ? robotsParser(`${origin}/robots.txt`, await response.text()) : null
        } catch { return null }
      })()
      cache.set(origin, check)
    }
    const parser = await check
    return parser?.isAllowed(candidate.toString(), userAgent) === true
  }
}

export async function fetchMediaBytes(
  url: string,
  policy: MediaCapturePolicy,
  budget: MediaRequestBudget,
  http: MediaHttpClient,
  options: { wait?: (milliseconds: number) => Promise<void>; accessPolicy: (url: string) => Promise<boolean> },
) {
  assertPublicHttpsUrl(url)
  if (!(await options.accessPolicy(url))) throw new MediaCaptureError('Image acquisition is disallowed by the source access policy', 'access_denied')
  const wait = options.wait ?? sleep
  let retry = 0
  while (true) {
    await reserveRequest(budget, policy.minimumDelayMs, wait)
    let response: MediaHttpResponse
    try {
      response = await http(url, { headers: { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', 'user-agent': policy.userAgent }, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    } catch (error) {
      if (retry >= policy.maxRetries) throw new MediaCaptureError(`Image request failed: ${error instanceof Error ? error.message : String(error)}`, 'retry_exhausted')
      retry += 1
      await wait(policy.minimumDelayMs * 2 ** retry)
      continue
    }
    if (response.status === 401 || response.status === 403) {
      budget.stopped = true
      throw new MediaCaptureError(`Image access rejected (${response.status})`, 'persistent_rejection')
    }
    if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
      if (retry >= policy.maxRetries) {
        budget.stopped = true
        throw new MediaCaptureError(`Image retries exhausted (${response.status})`, 'retry_exhausted')
      }
      retry += 1
      const delay = retryAfterMs(response) ?? policy.minimumDelayMs * 2 ** retry
      budget.cooldownUntil = Math.max(budget.cooldownUntil ?? 0, Date.now() + delay)
      await wait(delay)
      continue
    }
    if (!response.ok) throw new MediaCaptureError(`Image request failed (${response.status})`, 'invalid_response')
    const contentType = (getHeader(response.headers, 'content-type') ?? '').split(';', 1)[0].toLowerCase()
    const length = Number(getHeader(response.headers, 'content-length'))
    if (!acceptedImageTypes.has(contentType)) throw new MediaCaptureError('Image response has an unsupported content type', 'invalid_response')
    if (Number.isFinite(length) && length > maxImageBytes) throw new MediaCaptureError('Image response exceeds the 10 MiB media limit', 'invalid_response')
    let bytes: Uint8Array
    if (response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          total += next.value.byteLength
          if (total > maxImageBytes) {
            await reader.cancel()
            throw new MediaCaptureError('Image response exceeds the 10 MiB media limit', 'invalid_response')
          }
          chunks.push(next.value)
        }
      } finally { reader.releaseLock() }
      bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    } else {
      // Fixture transports may not expose a stream; real fetch responses do.
      bytes = new Uint8Array(await response.arrayBuffer())
    }
    if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) throw new MediaCaptureError('Image response has an invalid size', 'invalid_response')
    return { bytes, contentType }
  }
}

export async function createImageDerivatives(source: Uint8Array) {
  const image = sharp(source, { animated: false, limitInputPixels: 25_000_000 }).rotate()
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height) throw new MediaCaptureError('Image dimensions could not be determined', 'invalid_response')
  const [thumbnail, preview] = await Promise.all([
    sharp(source, { animated: false, limitInputPixels: 25_000_000 }).rotate().resize({ width: 96, height: 96, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
    sharp(source, { animated: false, limitInputPixels: 25_000_000 }).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
  ])
  const [thumbnailMeta, previewMeta] = await Promise.all([sharp(thumbnail).metadata(), sharp(preview).metadata()])
  if (!thumbnailMeta.width || !thumbnailMeta.height || !previewMeta.width || !previewMeta.height) throw new MediaCaptureError('Image derivative dimensions could not be determined', 'invalid_response')
  return {
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    thumbnail: { data: thumbnail, contentType: 'image/webp' as const, width: thumbnailMeta.width, height: thumbnailMeta.height },
    preview: { data: preview, contentType: 'image/webp' as const, width: previewMeta.width, height: previewMeta.height },
  }
}

export interface CaptureListingMediaInput {
  db: Database
  listingId: string
  /** A source-discovered product image URL; never an arbitrary operator URL. */
  sourceUrl?: string
  policy: MediaCapturePolicy
  budget: MediaRequestBudget
  http?: MediaHttpClient
  accessPolicy?: (url: string) => Promise<boolean>
  wait?: (milliseconds: number) => Promise<void>
  imageCache?: Map<string, Promise<{ acquired: Awaited<ReturnType<typeof fetchMediaBytes>>; derivatives: Awaited<ReturnType<typeof createImageDerivatives>> }>>
}

/** Captures one listing image only; callers must explicitly batch/queue these. */
export async function captureListingMedia(input: CaptureListingMediaInput) {
  if (!input.policy.enabled) throw new MediaCaptureError('Media capture is disabled until explicitly enabled by an operator', 'access_denied')
  const candidate = await getCaptureCandidate(input.db, input.listingId)
  const sourceUrl = input.sourceUrl ?? candidate?.imageUrl
  if (!candidate || !sourceUrl) return { status: 'skipped' as const, reason: 'no_image' as const }
  if (!new Set([candidate.imageUrl, ...candidate.imageUrls].filter((url): url is string => Boolean(url))).has(sourceUrl)) {
    throw new MediaCaptureError('Image URL was not discovered in this listing evidence', 'source_url_rejected')
  }
  if (candidate.moduleId !== 'shopify' || !isAllowedShopifyMediaUrl(candidate.config, sourceUrl)) {
    throw new MediaCaptureError('Image URL is not approved by this source module', 'source_url_rejected')
  }
  const reused = await reuseListingMedia(input.db, candidate.listingId, sourceUrl)
  if (reused) return { status: 'captured' as const, capture: reused }
  const http = input.http ?? ((url: string, init: RequestInit) => fetch(url, init) as Promise<MediaHttpResponse>)
  const accessPolicy = input.accessPolicy ?? createMediaRobotsAccessPolicy(input.budget, http, input.policy.userAgent, input.policy.minimumDelayMs, input.wait)
  let image = input.imageCache?.get(sourceUrl)
  if (!image) {
    image = (async () => {
      const acquired = await fetchMediaBytes(sourceUrl, input.policy, input.budget, http, { accessPolicy, wait: input.wait })
      return { acquired, derivatives: await createImageDerivatives(acquired.bytes) }
    })()
    input.imageCache?.set(sourceUrl, image)
  }
  const { acquired, derivatives } = await image
  const capture = await persistListingMedia(input.db, {
    listingId: candidate.listingId, sourceUrl, sourceBytes: acquired.bytes,
    sourceContentType: acquired.contentType, ...derivatives,
  })
  return { status: 'captured' as const, capture }
}

export interface RunMediaCaptureDependencies {
  /** Must be supplied by the worker from MEDIA_CAPTURE_ENABLED=true. */
  enabled?: boolean
  http?: MediaHttpClient
  wait?: (milliseconds: number) => Promise<void>
  accessPolicy?: (url: string) => Promise<boolean>
  after?: string
  policy?: Partial<Pick<MediaCapturePolicy, 'concurrency' | 'minimumDelayMs'>>
}

/**
 * Processes a bounded batch with a small number of overlapping image fetches.
 * Request starts remain globally paced and the caller controls continuation.
 */
export async function runMediaCapture(db: Database, runId: string, dependencies: RunMediaCaptureDependencies = {}) {
  if (!dependencies.enabled) {
    await db.update(mediaCaptureRuns).set({
      status: 'failed', error: 'Media capture is disabled by this deployment', completedAt: new Date(),
    }).where(eq(mediaCaptureRuns.id, runId))
    throw new MediaCaptureError('Media capture is disabled by this deployment', 'access_denied')
  }
  const [run] = await db.update(mediaCaptureRuns).set({ status: 'running', startedAt: new Date(), error: null }).where(eq(mediaCaptureRuns.id, runId)).returning()
  if (!run) throw new Error(`Media capture run ${runId} was not found`)
  const [source] = await db.select().from(catalogSources).where(eq(catalogSources.id, run.sourceId)).limit(1)
  if (!source) throw new Error(`Media capture source ${run.sourceId} was not found`)
  const policy = mediaCapturePolicySchema.parse({ enabled: true, requestLimit: run.requestLimit, ...dependencies.policy })
  const budget: MediaRequestBudget = { requests: 0, maxRequests: policy.requestLimit }
  const http = dependencies.http ?? ((url: string, init: RequestInit) => fetch(url, init) as Promise<MediaHttpResponse>)
  const accessPolicy = dependencies.accessPolicy ?? createMediaRobotsAccessPolicy(budget, http, policy.userAgent, policy.minimumDelayMs, dependencies.wait)
  let capturedCount = 0
  let error: string | null = null
  let after = dependencies.after
  let stopContinuation = false
  try {
    const candidates = (await listSourceMediaCandidates(db, source.id))
      .filter((candidate) => !after || mediaCandidateKey(candidate) > after)
      .slice(0, policy.requestLimit)
    for (let index = 0; index < candidates.length; index += policy.concurrency) {
      const wave = candidates.slice(index, index + policy.concurrency)
      const imageCache: NonNullable<CaptureListingMediaInput['imageCache']> = new Map()
      const outcomes = await Promise.all(wave.map(async (candidate) => {
        try {
          const result = await captureListingMedia({ db, listingId: candidate.listingId, sourceUrl: candidate.sourceUrl, policy, budget, http, accessPolicy, wait: dependencies.wait, imageCache })
          return { captured: result.status === 'captured', error: null }
        } catch (captureError) {
          return { captured: false, error: captureError }
        }
      }))
      capturedCount += outcomes.filter((outcome) => outcome.captured).length
      let reachedCeiling = false
      for (const [offset, outcome] of outcomes.entries()) {
        if (outcome.error) {
          error = outcome.error instanceof Error ? outcome.error.message : String(outcome.error)
          if (outcome.error instanceof MediaCaptureError) {
            if (outcome.error.kind === 'request_ceiling') { reachedCeiling = true; break }
            if (outcome.error.kind === 'persistent_rejection' || outcome.error.kind === 'retry_exhausted' || outcome.error.kind === 'access_denied') {
              stopContinuation = true
              break
            }
          }
        }
        after = mediaCandidateKey(wave[offset]!)
      }
      if (reachedCeiling || stopContinuation || budget.requests >= budget.maxRequests) break
    }
    const remaining = !stopContinuation && (await listSourceMediaCandidates(db, source.id))
      .some((candidate) => !after || mediaCandidateKey(candidate) > after)
    const status = error || remaining ? 'partial' : 'succeeded'
    await db.update(mediaCaptureRuns).set({ status, requestCount: budget.requests, capturedCount, error, completedAt: new Date() }).where(eq(mediaCaptureRuns.id, runId))
    return { after, hasMore: remaining, stopContinuation }
  } catch (runError) {
    const message = runError instanceof Error ? runError.message : String(runError)
    await db.update(mediaCaptureRuns).set({ status: 'failed', requestCount: budget.requests, capturedCount, error: message, completedAt: new Date() }).where(eq(mediaCaptureRuns.id, runId))
    throw runError
  }
}
