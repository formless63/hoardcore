import type { NormalizedCatalogRecord } from '../types'
import { ZodError } from 'zod'
import { normalizeShopifyCollection, parseShopifyCollection } from './contracts'
import {
  createShopifyCollectionRun,
  fetchShopifyCollectionPage,
  ShopifyCollectionTransportError,
  type ShopifyCacheEntry,
  type ShopifyCollectionRun,
  type ShopifyHttpClient,
  type ShopifyTransportOptions,
} from './transport'

export interface ShopifyCollectionPolicy {
  minimumDelayMs: number
  maxRequests: number
  maxRetries: number
  backoffBaseMs: number
  userAgent: string
}

export interface CollectShopifySnapshotInput {
  catalogUrl: string
  sourceKey: string
  cache?: ShopifyCacheEntry
  policy: ShopifyCollectionPolicy
  http: ShopifyHttpClient
  accessPolicy: NonNullable<ShopifyTransportOptions['accessPolicy']>
  run?: ShopifyCollectionRun
  sleep?: ShopifyTransportOptions['sleep']
  observedAt?: string
  onEvent?: ShopifyTransportOptions['onEvent']
  onPage?: (page: number, products: number, totalProducts: number) => Promise<void> | void
}

export type ShopifySnapshotResult =
  | {
      status: 'not_modified'
      cache: ShopifyCacheEntry
      requestCount: number
    }
  | {
      status: 'ok' | 'partial'
      cache: ShopifyCacheEntry
      requestCount: number
      pageCount: number
      productCount: number
      records: NormalizedCatalogRecord[]
      evidencePayload: unknown
      incomplete?: { kind: 'request_ceiling' | 'invalid_page'; page: number; detail?: string }
    }

/**
 * Acquires catalog pages sequentially. A bounded run can return a clearly
 * marked partial snapshot; callers must not infer absence from it.
 */
export async function collectShopifySnapshot(
  input: CollectShopifySnapshotInput,
): Promise<ShopifySnapshotResult> {
  const run = input.run ?? createShopifyCollectionRun(input.policy.maxRequests)
  const pages: unknown[] = []
  let firstPageCache: ShopifyCacheEntry | undefined
  let productCount = 0

  function snapshot(
    status: 'ok' | 'partial',
    incomplete?: { kind: 'request_ceiling' | 'invalid_page'; page: number; detail?: string },
    rejectedPage?: unknown,
  ): ShopifySnapshotResult {
    const merged = { products: pages.flatMap((payload) => parseShopifyCollection(payload).products) }
    return {
      status,
      cache: firstPageCache ?? {},
      requestCount: run.requests,
      pageCount: pages.length,
      productCount,
      incomplete,
      records: normalizeShopifyCollection(merged, {
        sourceKey: input.sourceKey,
        baseUrl: input.catalogUrl,
        observedAt: input.observedAt,
      }),
      // Preserve the source JSON, including blank optional fields that the
      // normalized records intentionally omit.
      evidencePayload: rejectedPage === undefined ? { pages } : { pages, rejectedPage },
    }
  }

  for (let page = 1; ; page += 1) {
    let result: Awaited<ReturnType<typeof fetchShopifyCollectionPage>>
    try {
      result = await fetchShopifyCollectionPage(
        input.catalogUrl,
        page,
        page === 1 ? input.cache : undefined,
        {
          http: input.http,
          accessPolicy: input.accessPolicy,
          run,
          sleep: input.sleep,
          ...input.policy,
          onEvent: input.onEvent,
        },
      )
    } catch (error) {
      if (error instanceof ShopifyCollectionTransportError && error.kind === 'request_ceiling' && pages.length > 0) {
        return snapshot('partial', { kind: 'request_ceiling', page })
      }
      throw error
    }

    if (result.status === 'not_modified') {
      return {
        status: 'not_modified',
        cache: input.cache ?? {},
        requestCount: run.requests,
      }
    }

    if (page === 1) firstPageCache = result.cache
    let parsedPage: ReturnType<typeof parseShopifyCollection>
    try {
      parsedPage = parseShopifyCollection(result.payload)
    } catch (error) {
      if (!(error instanceof ZodError) || pages.length === 0) throw error
      const detail = error.issues.slice(0, 3).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      return snapshot('partial', { kind: 'invalid_page', page, detail }, result.payload)
    }
    pages.push(result.payload)
    productCount += parsedPage.products.length
    await input.onPage?.(page, parsedPage.products.length, productCount)

    if (parsedPage.products.length < 250) {
      return snapshot('ok')
    }
  }
}
