import type { Task, TaskList } from 'graphile-worker'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDatabase } from '../db/index.server'
import { catalogSources } from '../db/schema/catalog-sources'
import { collectionRunEvents, collectionRuns } from '../db/schema/catalog'
import { persistCatalogSnapshot } from '../db/catalog-persistence.server'
import { createShopifyCollectionRun, type ShopifyCollectionRun, type ShopifyHttpClient } from '../../modules/shopify/transport'
import { collectShopifySnapshot, type ShopifyCollectionPolicy } from '../../modules/shopify/collector'
import robotsParser from 'robots-parser'
import { shopifySourceConfigSchema } from '../../modules/shopify'

/** Payloads for the application-owned durable task names. */
export interface HoardcoreTaskPayloads {
  'fixture.echo': { value: string }
  'catalog.collect': { sourceId: string; runId: string }
}

declare global {
  namespace GraphileWorker {
    interface Tasks extends HoardcoreTaskPayloads {}
  }
}

export const fixtureEchoTask: Task<'fixture.echo'> = async (payload, helpers) => {
  helpers.logger.info(`fixture.echo: ${payload.value}`)
}

export interface CatalogCollectionTaskDependencies {
  accessPolicy?: (url: string) => Promise<boolean>
  run?: ShopifyCollectionRun
  http?: ShopifyHttpClient
}

export function createRobotsAccessPolicy(
  run: ShopifyCollectionRun,
  http: typeof fetch = fetch,
  userAgent = 'Hoardcore/0.1 (conservative catalog collector)',
  onRequest?: (requestCount: number, status?: number) => Promise<void> | void,
) {
  const cache = new Map<string, ReturnType<typeof robotsParser>>()
  return async (url: string): Promise<boolean> => {
    const origin = new URL(url).origin
    const cached = cache.get(origin)
    if (cached !== undefined) return cached.isAllowed(url, userAgent) === true
    if (run.requests >= run.maxRequests) return false
    run.requests += 1
    try {
      await onRequest?.(run.requests)
      const response = await http(`${origin}/robots.txt`, {
        headers: { accept: 'text/plain', 'user-agent': userAgent },
        signal: AbortSignal.timeout(5000),
      })
      await onRequest?.(run.requests, response.status)
      if (!response.ok) return false
      const parser = robotsParser(`${origin}/robots.txt`, await response.text())
      cache.set(origin, parser)
      return parser.isAllowed(url, userAgent) === true
    } catch {
      return false
    }
  }
}

export async function runCatalogCollection(
  payload: HoardcoreTaskPayloads['catalog.collect'],
  helpers: { logger: { info(message: string): void } },
  dependencies: CatalogCollectionTaskDependencies = {},
) {
  const db = getDatabase()
  const [source] = await db.select().from(catalogSources).where(eq(catalogSources.id, payload.sourceId))
  if (!source) throw new Error(`Catalog source ${payload.sourceId} was not found`)
  const [priorRun] = await db.select().from(collectionRuns).where(and(inArray(collectionRuns.status, ['succeeded', 'not_modified']), eq(collectionRuns.sourceId, source.id))).orderBy(desc(collectionRuns.completedAt)).limit(1)
  const [runRecord] = await db.update(collectionRuns).set({ status: 'running', startedAt: new Date() }).where(eq(collectionRuns.id, payload.runId)).returning()
  if (!runRecord) throw new Error(`Collection run ${payload.runId} was not found`)
  if (source.moduleId !== 'shopify') {
    throw new Error(`Collection module ${source.moduleId} is not implemented`)
  }
  const policy: ShopifyCollectionPolicy & { catalogUrl: string } =
    shopifySourceConfigSchema.parse(source.config)
  policy.maxRequests = runRecord.requestLimit
  const run = dependencies.run ?? createShopifyCollectionRun(policy.maxRequests)
  async function log(message: string, requestCount = run.requests) {
    await db.insert(collectionRunEvents).values({ runId: payload.runId, message })
    await db.update(collectionRuns).set({ requestCount: String(requestCount) }).where(eq(collectionRuns.id, payload.runId))
  }
  try {
    await log('Collection started. Checking source access policy.')
    const accessPolicy = dependencies.accessPolicy ?? createRobotsAccessPolicy(run, fetch, policy.userAgent, async (requestCount, status) => {
      await log(status === undefined ? 'Checking robots.txt.' : `robots.txt responded with HTTP ${status}.`, requestCount)
    })
    const catalogUrl = policy.catalogUrl
    const initialCache = { etag: priorRun?.etag ?? undefined, lastModified: priorRun?.lastModified ?? undefined }
    const observedAt = new Date()
    const result = await collectShopifySnapshot({
      catalogUrl,
      sourceKey: source.sourceKey,
      cache: initialCache,
      policy,
      http: dependencies.http ?? ((url, init) => fetch(url, init)),
      accessPolicy,
      run,
      observedAt: observedAt.toISOString(),
      onEvent: async (event) => {
        await log(event.type === 'request_started'
          ? `Request ${event.requestCount} of ${run.maxRequests}: fetching catalog page ${event.page}.`
          : `Catalog page ${event.page} responded with HTTP ${event.status}.`, event.requestCount)
      },
      onPage: async (page, products, totalProducts) => {
        await db.update(collectionRuns).set({ pageCount: page, productCount: totalProducts }).where(eq(collectionRuns.id, payload.runId))
        await log(`Page ${page} contained ${products} products (${totalProducts} seen so far).`)
      },
    })

    if (result.status !== 'not_modified') {
      await log(`Saving ${result.records.length} listings from ${result.pageCount} fetched pages${result.status === 'partial' ? ' (incomplete collection)' : ''}.`)
      await persistCatalogSnapshot(db, source.id, result.records, {
        runId: payload.runId,
        observedAt,
        evidence: { payload: result.evidencePayload, contentType: 'application/json' },
      })
    }
    await db.update(collectionRuns).set({
      status: result.status === 'ok' ? 'succeeded' : result.status,
      requestCount: String(result.requestCount),
      pageCount: result.status === 'not_modified' ? 0 : result.pageCount,
      productCount: result.status === 'not_modified' ? 0 : result.productCount,
      error: result.status === 'partial' && result.incomplete?.kind === 'invalid_page'
        ? `Page ${result.incomplete.page} failed validation: ${result.incomplete.detail}`
        : null,
      etag: result.cache.etag,
      lastModified: result.cache.lastModified,
      completedAt: new Date(),
    }).where(eq(collectionRuns.id, payload.runId))
    await db.update(catalogSources).set({ status: 'active', updatedAt: new Date() }).where(eq(catalogSources.id, source.id))
    await log(result.status === 'partial'
      ? result.incomplete?.kind === 'invalid_page'
        ? `Page ${result.incomplete.page} failed validation (${result.incomplete.detail}). Saved ${result.productCount} products from earlier pages as a partial snapshot.`
        : `Request ceiling reached after ${result.pageCount} full pages. Saved ${result.productCount} products as a partial snapshot; more pages may exist.`
      : result.status === 'not_modified' ? 'Source reported no change.' : `Complete snapshot saved: ${result.productCount} products.`)
    helpers.logger.info(`catalog.collect: ${source.id} completed`)
  } catch (error) {
    const requestCount = run.requests
    try {
      await db.update(collectionRuns).set({ status: 'failed', requestCount: String(requestCount), error: error instanceof Error ? error.message : String(error), completedAt: new Date() }).where(eq(collectionRuns.id, payload.runId))
      await db.update(catalogSources).set({ status: 'error', updatedAt: new Date() }).where(eq(catalogSources.id, source.id))
      await log(`Collection stopped: ${error instanceof Error ? error.message : String(error)}`)
    } catch (reportError) {
      helpers.logger.info(`catalog.collect: ${source.id} could not record failure: ${String(reportError)}`)
    }
    helpers.logger.info(`catalog.collect: ${source.id} failed without automatic retry`)
  }
}

export const catalogCollectTask: Task<'catalog.collect'> = async (payload, helpers) => runCatalogCollection(payload, helpers)

/** The only task registry passed to Graphile Worker. Add source-independent tasks here. */
export const taskRegistry = {
  'fixture.echo': fixtureEchoTask,
  'catalog.collect': catalogCollectTask,
} satisfies TaskList
