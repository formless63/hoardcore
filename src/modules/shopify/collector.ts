import type { NormalizedCatalogRecord } from '../types'
import { normalizeShopifyCollection, parseShopifyCollection } from './contracts'
import {
  createShopifyCollectionRun,
  fetchShopifyCollectionPage,
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
}

export type ShopifySnapshotResult =
  | {
      status: 'not_modified'
      cache: ShopifyCacheEntry
      requestCount: number
    }
  | {
      status: 'ok'
      cache: ShopifyCacheEntry
      requestCount: number
      records: NormalizedCatalogRecord[]
      evidencePayload: unknown
    }

/**
 * Acquires a complete collection snapshot sequentially. Nothing is normalized
 * or persisted until the final page proves the snapshot is complete.
 */
export async function collectShopifySnapshot(
  input: CollectShopifySnapshotInput,
): Promise<ShopifySnapshotResult> {
  const run = input.run ?? createShopifyCollectionRun(input.policy.maxRequests)
  const pages: unknown[] = []
  let firstPageCache: ShopifyCacheEntry | undefined

  for (let page = 1; ; page += 1) {
    const result = await fetchShopifyCollectionPage(
      input.catalogUrl,
      page,
      page === 1 ? input.cache : undefined,
      {
        http: input.http,
        accessPolicy: input.accessPolicy,
        run,
        sleep: input.sleep,
        ...input.policy,
      },
    )

    if (result.status === 'not_modified') {
      return {
        status: 'not_modified',
        cache: input.cache ?? {},
        requestCount: run.requests,
      }
    }

    if (page === 1) firstPageCache = result.cache
    pages.push(result.payload)
    const parsedPage = parseShopifyCollection(result.payload)

    if (parsedPage.products.length < 250) {
      const merged = {
        products: pages.flatMap((payload) => parseShopifyCollection(payload).products),
      }
      return {
        status: 'ok',
        cache: firstPageCache ?? {},
        requestCount: run.requests,
        records: normalizeShopifyCollection(merged, {
          sourceKey: input.sourceKey,
          baseUrl: input.catalogUrl,
          observedAt: input.observedAt,
        }),
        evidencePayload: merged,
      }
    }
  }
}
