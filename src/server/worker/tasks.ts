import type { Task, TaskList } from 'graphile-worker'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDatabase } from '../db/index.server'
import { catalogSources } from '../db/schema/catalog-sources'
import { collectionRuns } from '../db/schema/catalog'
import { persistCatalogSnapshot } from '../db/catalog-persistence.server'
import { createShopifyCollectionRun, type ShopifyCollectionRun } from '../../modules/shopify/transport'
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
}

export function createRobotsAccessPolicy(
  run: ShopifyCollectionRun,
  http: typeof fetch = fetch,
  userAgent = 'Hoardcore/0.1 (conservative catalog collector)',
) {
  const cache = new Map<string, ReturnType<typeof robotsParser>>()
  return async (url: string): Promise<boolean> => {
    const origin = new URL(url).origin
    const cached = cache.get(origin)
    if (cached !== undefined) return cached.isAllowed(url, userAgent) === true
    if (run.requests >= run.maxRequests) return false
    run.requests += 1
    try {
      const response = await http(`${origin}/robots.txt`, {
        headers: { accept: 'text/plain', 'user-agent': userAgent },
        signal: AbortSignal.timeout(5000),
      })
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
  const run = dependencies.run ?? createShopifyCollectionRun(policy.maxRequests)
  try {
    const accessPolicy = dependencies.accessPolicy ?? createRobotsAccessPolicy(run, fetch, policy.userAgent)
    const catalogUrl = policy.catalogUrl
    const initialCache = { etag: priorRun?.etag ?? undefined, lastModified: priorRun?.lastModified ?? undefined }
    const observedAt = new Date()
    const result = await collectShopifySnapshot({
      catalogUrl,
      sourceKey: source.sourceKey,
      cache: initialCache,
      policy,
      http: (url, init) => fetch(url, init),
      accessPolicy,
      run,
      observedAt: observedAt.toISOString(),
    })

    if (result.status === 'ok') {
      await persistCatalogSnapshot(db, source.id, result.records, {
        runId: payload.runId,
        observedAt,
        evidence: { payload: result.evidencePayload, contentType: 'application/json' },
      })
    }
    await db.update(collectionRuns).set({
      status: result.status === 'ok' ? 'succeeded' : 'not_modified',
      requestCount: String(result.requestCount),
      etag: result.cache.etag,
      lastModified: result.cache.lastModified,
      completedAt: new Date(),
    }).where(eq(collectionRuns.id, payload.runId))
    await db.update(catalogSources).set({ status: 'active', updatedAt: new Date() }).where(eq(catalogSources.id, source.id))
    helpers.logger.info(`catalog.collect: ${source.id} completed`)
  } catch (error) {
    const requestCount = run.requests
    await db.update(collectionRuns).set({ status: 'failed', requestCount: String(requestCount), error: error instanceof Error ? error.message : String(error), completedAt: new Date() }).where(eq(collectionRuns.id, payload.runId))
    await db.update(catalogSources).set({ status: 'error', updatedAt: new Date() }).where(eq(catalogSources.id, source.id))
    throw error
  }
}

export const catalogCollectTask: Task<'catalog.collect'> = async (payload, helpers) => runCatalogCollection(payload, helpers)

/** The only task registry passed to Graphile Worker. Add source-independent tasks here. */
export const taskRegistry = {
  'fixture.echo': fixtureEchoTask,
  'catalog.collect': catalogCollectTask,
} satisfies TaskList
