import type { JobHelpers, Task, TaskList } from 'graphile-worker'
import { and, desc, eq, inArray, lte, isNotNull } from 'drizzle-orm'
import { getDatabase } from '../db/index.server'
import { catalogSources } from '../db/schema/catalog-sources'
import { collectionRunEvents, collectionRuns } from '../db/schema/catalog'
import { persistCatalogSnapshot } from '../db/catalog-persistence.server'
import { createShopifyCollectionRun, ShopifyCollectionTransportError, type ShopifyCollectionRun, type ShopifyHttpClient } from '../../modules/shopify/transport'
import { createSecureShopifyHttpClient, type ShopifyPinnedRequest, type ShopifyResolver } from '../../modules/shopify/network.server'
import { normalizeShopifyCatalogUrl } from '../../modules/shopify/source-config'
import { collectShopifySnapshot, type ShopifyCollectionPolicy } from '../../modules/shopify/collector'
import robotsParser from 'robots-parser'
import { shopifySourceConfigSchema } from '../../modules/shopify'
import { runMediaCapture } from '~/features/media/capture.server'
import { enqueueMediaCaptureBatch, listSourceMediaCandidates } from '~/features/media/media.server'
import { getServerConfig } from '~/server/config.server'
import { mediaCaptureRuns } from '~/server/db/schema/media'
import { evaluateCollectionAlertsTask, deliverAlertsTask, type AlertTaskPayload, type AlertDeliveryTaskPayload } from '~/features/alerts/alerts.tasks'
import { COLLECTION_DISABLED_MESSAGE } from '~/features/sources/collection-gate'

/** Payloads for the application-owned durable task names. */
export interface HoardcoreTaskPayloads {
  'fixture.echo': { value: string }
  'catalog.collect': { sourceId: string; runId: string }
  catalog_schedule: Record<string, never>
  'media.capture': { runId: string; after?: string; auto?: boolean }
  'alerts.evaluate': AlertTaskPayload
  'alerts.deliver': AlertDeliveryTaskPayload
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
  resolver?: ShopifyResolver
  request?: ShopifyPinnedRequest
  collectionEnabled?: boolean
  mediaEnabled?: boolean
}

export function createRobotsAccessPolicy(
  run: ShopifyCollectionRun,
  http: ShopifyHttpClient = createSecureShopifyHttpClient(),
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
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      })
      await onRequest?.(run.requests, response.status)
      if (response.status < 200 || response.status >= 300) return false
      const parser = robotsParser(`${origin}/robots.txt`, await new Response(response.body).text())
      cache.set(origin, parser)
      return parser.isAllowed(url, userAgent) === true
    } catch {
      return false
    }
  }
}

export async function runCatalogCollection(
  payload: HoardcoreTaskPayloads['catalog.collect'],
  helpers: { logger: { info(message: string): void }; addJob?: JobHelpers['addJob'] },
  dependencies: CatalogCollectionTaskDependencies = {},
) {
  const db = getDatabase()
  if (!(dependencies.collectionEnabled ?? (getServerConfig().CATALOG_COLLECTION_ENABLED === 'true'))) {
    await db.update(collectionRuns).set({ status: 'failed', error: COLLECTION_DISABLED_MESSAGE, completedAt: new Date() }).where(eq(collectionRuns.id, payload.runId))
    throw new Error(COLLECTION_DISABLED_MESSAGE)
  }
  const [source] = await db.select().from(catalogSources).where(eq(catalogSources.id, payload.sourceId))
  if (!source) throw new Error(`Catalog source ${payload.sourceId} was not found`)
  if (!source.collectionEnabled) {
    await db.update(collectionRuns).set({ status: 'failed', error: 'Collection is paused for this source', completedAt: new Date() }).where(eq(collectionRuns.id, payload.runId))
    return
  }
  const [priorRun] = await db.select().from(collectionRuns).where(and(inArray(collectionRuns.status, ['succeeded', 'not_modified']), eq(collectionRuns.sourceId, source.id))).orderBy(desc(collectionRuns.completedAt)).limit(1)
  const [runRecord] = await db.update(collectionRuns).set({ status: 'running', startedAt: new Date() }).where(eq(collectionRuns.id, payload.runId)).returning()
  if (!runRecord) throw new Error(`Collection run ${payload.runId} was not found`)
  const run = dependencies.run ?? createShopifyCollectionRun(runRecord.requestLimit)
  async function log(message: string, requestCount = run.requests) {
    await db.insert(collectionRunEvents).values({ runId: payload.runId, message })
    await db.update(collectionRuns).set({ requestCount: String(requestCount) }).where(eq(collectionRuns.id, payload.runId))
  }
  try {
    if (source.moduleId !== 'shopify') {
      throw new Error(`Collection module ${source.moduleId} is not implemented`)
    }
    const persistedPolicy = shopifySourceConfigSchema.parse(source.config)
    // Re-normalize persisted configuration too; registration validation alone
    // must not be the only boundary protecting a manually altered database row.
    const policy: ShopifyCollectionPolicy & { catalogUrl: string } = {
      ...persistedPolicy,
      catalogUrl: normalizeShopifyCatalogUrl(persistedPolicy.catalogUrl).config.catalogUrl as string,
      maxRequests: runRecord.requestLimit,
    }
    await log('Collection started. Checking source access policy.')
    const http = dependencies.http ?? createSecureShopifyHttpClient({ resolver: dependencies.resolver, request: dependencies.request })
    const accessPolicy = dependencies.accessPolicy ?? createRobotsAccessPolicy(run, http, policy.userAgent, async (requestCount, status) => {
      await log(status === undefined ? 'Checking robots.txt.' : `robots.txt responded with HTTP ${status}.`, requestCount)
    })
    const catalogUrl = policy.catalogUrl
  // A first-page validator cannot prove a previously paginated collection is
  // unchanged: later pages may have changed independently. Fetch page one
  // unconditionally in that case; we retain validators for known single-page
  // snapshots where a 304 is a complete answer.
  const initialCache = priorRun && priorRun.pageCount <= 1
    ? { etag: priorRun.etag ?? undefined, lastModified: priorRun.lastModified ?? undefined }
    : undefined
    const observedAt = new Date()
    const result = await collectShopifySnapshot({
      catalogUrl,
      sourceKey: source.sourceKey,
      cache: initialCache,
      policy,
      http,
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
      const persisted = await persistCatalogSnapshot(db, source.id, result.records, {
        runId: payload.runId,
        observedAt,
        evidence: { payload: result.evidencePayload, contentType: 'application/json' },
      })
      if (persisted.length && helpers.addJob) {
        try {
          await helpers.addJob('alerts.evaluate', { runId: payload.runId, listingIds: persisted.map((item) => item.listingId) })
        } catch (alertError) {
          helpers.logger.info(`alerts.evaluate could not be queued; catalog persistence remains intact: ${String(alertError)}`)
        }
      }
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
    if ((dependencies.mediaEnabled ?? getServerConfig().MEDIA_CAPTURE_ENABLED === 'true') && helpers.addJob) {
      try {
        if ((await listSourceMediaCandidates(db, source.id)).length) {
          await enqueueMediaCaptureBatch(db, source.id, getServerConfig().MEDIA_CAPTURE_AUTO_REQUEST_LIMIT, (runId) =>
            helpers.addJob!('media.capture', { runId, auto: true }, { maxAttempts: 1, priority: 10 }))
        }
      } catch (mediaError) {
        helpers.logger.info(`media.capture could not be queued; catalog persistence remains intact: ${String(mediaError)}`)
      }
    }
    helpers.logger.info(`catalog.collect: ${source.id} completed`)
  } catch (error) {
    const requestCount = run.requests
    if (error instanceof ShopifyCollectionTransportError && error.kind === 'retry_after' && error.retryAfterMs !== undefined && helpers.addJob) {
      const retryAt = new Date(Date.now() + error.retryAfterMs)
      try {
        await helpers.addJob('catalog.collect', payload, { runAt: retryAt, maxAttempts: 1 })
        await db.update(collectionRuns).set({
          status: 'queued', requestCount: String(requestCount),
          error: `Deferred until ${retryAt.toISOString()} after source Retry-After.`,
          completedAt: null,
        }).where(eq(collectionRuns.id, payload.runId))
        await db.update(catalogSources).set({ status: 'active', updatedAt: new Date() }).where(eq(catalogSources.id, source.id))
        await log(`Source requested Retry-After; collection deferred until ${retryAt.toISOString()}.`, requestCount)
        helpers.logger.info(`catalog.collect: ${source.id} deferred until ${retryAt.toISOString()}`)
        return
      } catch (deferError) {
        helpers.logger.info(`catalog.collect: ${source.id} could not defer source Retry-After: ${String(deferError)}`)
      }
    }
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

/** Per-source schedules are inert until explicitly enabled by an operator. */
export const catalogScheduleTask: Task<'catalog_schedule'> = async (_payload, helpers) => {
  if (getServerConfig().CATALOG_COLLECTION_ENABLED !== 'true') return
  const db = getDatabase()
  const now = new Date()
  const due = await db.select().from(catalogSources).where(and(
    eq(catalogSources.collectionEnabled, true),
    isNotNull(catalogSources.scheduleHours),
    lte(catalogSources.nextRunAt, now),
  )).orderBy(catalogSources.nextRunAt).limit(20)
  for (const source of due) {
    if (!source.scheduleHours) continue
    const nextRunAt = new Date(now.getTime() + source.scheduleHours * 60 * 60 * 1000)
    try {
      // Claim the due slot before enqueuing. A concurrent pause or schedule edit
      // invalidates this exact timestamp and cannot trigger an unwanted run.
      const claimed = await db.update(catalogSources).set({ nextRunAt, updatedAt: now }).where(and(
        eq(catalogSources.id, source.id),
        eq(catalogSources.collectionEnabled, true),
        eq(catalogSources.nextRunAt, source.nextRunAt!),
        eq(catalogSources.scheduleHours, source.scheduleHours),
      )).returning({ id: catalogSources.id })
      if (!claimed.length) continue
      const [run] = await db.insert(collectionRuns).values({ sourceId: source.id, requestLimit: source.scheduleRequestLimit }).onConflictDoNothing().returning({ id: collectionRuns.id })
      if (run) {
        await db.insert(collectionRunEvents).values({ runId: run.id, message: `Scheduled collection queued with a ceiling of ${source.scheduleRequestLimit} requests.` })
        try { await helpers.addJob('catalog.collect', { sourceId: source.id, runId: run.id }, { maxAttempts: 1 }) }
        catch (error) {
          await db.update(collectionRuns).set({ status: 'failed', error: `Schedule enqueue failed: ${String(error)}`, completedAt: new Date() }).where(eq(collectionRuns.id, run.id))
          throw error
        }
      }
    } catch (error) {
      helpers.logger.error(`catalog_schedule: could not queue source ${source.id}: ${String(error)}`)
    }
  }
}

export const mediaCaptureTask: Task<'media.capture'> = async (payload, helpers) => {
  try {
    const db = getDatabase()
    const config = getServerConfig()
    const outcome = await runMediaCapture(db, payload.runId, {
      enabled: config.MEDIA_CAPTURE_ENABLED === 'true', after: payload.after,
      policy: { concurrency: config.MEDIA_CAPTURE_CONCURRENCY, minimumDelayMs: config.MEDIA_CAPTURE_MINIMUM_DELAY_MS },
    })
    helpers.logger.info(`media.capture: ${payload.runId} finished`)
    if (payload.auto && outcome.hasMore && !outcome.stopContinuation) {
      try {
        const [completed] = await db.select({ sourceId: mediaCaptureRuns.sourceId }).from(mediaCaptureRuns).where(eq(mediaCaptureRuns.id, payload.runId)).limit(1)
        if (completed) await enqueueMediaCaptureBatch(db, completed.sourceId, config.MEDIA_CAPTURE_AUTO_REQUEST_LIMIT, (runId) =>
          helpers.addJob('media.capture', { runId, after: outcome.after, auto: true }, { maxAttempts: 1, priority: 10 }))
      } catch (queueError) {
        helpers.logger.error(`media.capture continuation could not be queued: ${String(queueError)}`)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await getDatabase().update(mediaCaptureRuns).set({ status: 'failed', error: message, completedAt: new Date() }).where(eq(mediaCaptureRuns.id, payload.runId))
    helpers.logger.error(`media.capture: ${payload.runId} stopped: ${message}`)
  }
}

/** The only task registry passed to Graphile Worker. Add source-independent tasks here. */
export const taskRegistry = {
  'fixture.echo': fixtureEchoTask,
  'catalog.collect': catalogCollectTask,
  catalog_schedule: catalogScheduleTask,
  'media.capture': mediaCaptureTask,
  'alerts.evaluate': evaluateCollectionAlertsTask,
  'alerts.deliver': deliverAlertsTask,
} satisfies TaskList
