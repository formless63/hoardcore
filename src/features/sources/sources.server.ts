import { and, desc, eq, inArray } from 'drizzle-orm'
import { getSourceModule } from '~/modules/registry'
import { getDatabase } from '~/server/db/index.server'
import { catalogSources, collectionRuns, type CatalogSource } from '~/server/db/schema'
import {
  catalogSourceSummarySchema,
  type CatalogSourceSummary,
  type CreateCatalogSourceInput,
  type UpdateSourceScheduleInput,
  type UpdateSourceCatalogOptionsInput,
} from './sources.schemas'
import { shopifySourceConfigSchema } from '~/modules/shopify'
import { nextCronRun } from './source-schedule'

function isUniqueConstraintViolation(error: unknown): boolean {
  let current = error

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false
    }

    if ('code' in current && current.code === '23505') {
      return true
    }

    current = 'cause' in current ? current.cause : undefined
  }

  return false
}

function summarizeCatalogSource(source: CatalogSource): CatalogSourceSummary {
  const sourceModule = getSourceModule(source.moduleId)

  if (!sourceModule) {
    // Keep the source visible (and removable/exportable) if a module is no
    // longer installed. One unavailable module must not hide every source.
    return catalogSourceSummarySchema.parse({
      id: source.id,
      displayName: source.displayName,
      moduleId: source.moduleId,
      moduleName: source.moduleId,
      status: source.status,
      collectionEnabled: source.collectionEnabled,
      scheduleCron: source.scheduleCron,
      scheduleTimezone: source.scheduleTimezone,
      legacyScheduleHours: source.scheduleHours,
      scheduleRequestLimit: source.scheduleRequestLimit,
      nextRunAt: source.nextRunAt?.toISOString() ?? null,
      summary: 'Source module unavailable',
      currency: null,
      stockCardsEnabled: false,
      createdAt: source.createdAt.toISOString(),
    })
  }

  const normalized = sourceModule.sourceRegistration.read(source.config)

  return catalogSourceSummarySchema.parse({
    id: source.id,
    displayName: source.displayName,
    moduleId: source.moduleId,
    moduleName: sourceModule.manifest.name,
    status: source.status,
    collectionEnabled: source.collectionEnabled,
    scheduleCron: source.scheduleCron,
    scheduleTimezone: source.scheduleTimezone,
    legacyScheduleHours: source.scheduleHours,
    scheduleRequestLimit: source.scheduleRequestLimit,
    nextRunAt: source.nextRunAt?.toISOString() ?? null,
    summary: normalized.summary,
    currency: typeof normalized.config.currency === 'string' ? normalized.config.currency : null,
    stockCardsEnabled: normalized.config.stockCardsEnabled === true,
    createdAt: source.createdAt.toISOString(),
  })
}

export async function updateSourceScheduleInDatabase(input: UpdateSourceScheduleInput): Promise<CatalogSourceSummary> {
  const [source] = await getDatabase().update(catalogSources).set({
    collectionEnabled: input.collectionEnabled,
    scheduleHours: null,
    scheduleCron: input.scheduleCron,
    scheduleTimezone: input.scheduleTimezone,
    scheduleRequestLimit: input.scheduleRequestLimit,
    nextRunAt: input.collectionEnabled && input.scheduleCron
      ? nextCronRun(input.scheduleCron, input.scheduleTimezone)
      : null,
    updatedAt: new Date(),
  }).where(eq(catalogSources.id, input.sourceId)).returning()
  if (!source) throw new Error('Catalog source not found')
  return summarizeCatalogSource(source)
}

export async function updateSourceCatalogOptionsInDatabase(input: UpdateSourceCatalogOptionsInput): Promise<CatalogSourceSummary> {
  const [source] = await getDatabase().select().from(catalogSources).where(eq(catalogSources.id, input.sourceId)).limit(1)
  if (!source) throw new Error('Catalog source not found')
  if (source.moduleId !== 'shopify') throw new Error('Catalog options are not available for this source')
  shopifySourceConfigSchema.parse(source.config)
  const [activeRun] = await getDatabase().select({ id: collectionRuns.id }).from(collectionRuns)
    .where(and(eq(collectionRuns.sourceId, input.sourceId), inArray(collectionRuns.status, ['queued', 'running']))).limit(1)
  if (activeRun) throw new Error('Pause or finish the active collection before changing catalog options')
  const nextConfig = { ...source.config, ...(input.currency ? { currency: input.currency } : {}), stockCardsEnabled: input.stockCardsEnabled }
  if (!input.currency) delete nextConfig.currency
  const [updated] = await getDatabase().update(catalogSources).set({ config: nextConfig, updatedAt: new Date() }).where(eq(catalogSources.id, input.sourceId)).returning()
  if (!updated) throw new Error('Catalog source not found')
  return summarizeCatalogSource(updated)
}

export async function listCatalogSourcesFromDatabase(): Promise<{
  sources: CatalogSourceSummary[]
}> {
  const rows = await getDatabase()
    .select()
    .from(catalogSources)
    .orderBy(desc(catalogSources.createdAt))

  return { sources: rows.map(summarizeCatalogSource) }
}

export async function createCatalogSourceInDatabase(
  input: CreateCatalogSourceInput,
): Promise<CatalogSourceSummary> {
  const sourceModule = getSourceModule(input.moduleId)

  if (!sourceModule) {
    throw new Error('That source type is not available')
  }

  const normalized = sourceModule.sourceRegistration.normalize(input.config)

  try {
    const [created] = await getDatabase()
      .insert(catalogSources)
      .values({
        moduleId: sourceModule.manifest.id,
        displayName: input.displayName,
        sourceKey: normalized.sourceKey,
        status: 'not_collected',
        config: normalized.config,
      })
      .returning()

    if (!created) {
      throw new Error('The source could not be created')
    }

    return summarizeCatalogSource(created)
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new Error('That source is already registered')
    }

    console.error('Failed to create catalog source', error)
    throw new Error('The source could not be registered. Try again.')
  }
}
