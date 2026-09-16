import { desc } from 'drizzle-orm'
import { getSourceModule } from '~/modules/registry'
import { getDatabase } from '~/server/db/index.server'
import { catalogSources, type CatalogSource } from '~/server/db/schema'
import {
  catalogSourceSummarySchema,
  type CatalogSourceSummary,
  type CreateCatalogSourceInput,
} from './sources.schemas'

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
    throw new Error(`Catalog source ${source.id} uses an unavailable module: ${source.moduleId}`)
  }

  const normalized = sourceModule.sourceRegistration.read(source.config)

  return catalogSourceSummarySchema.parse({
    id: source.id,
    displayName: source.displayName,
    moduleId: source.moduleId,
    moduleName: sourceModule.manifest.name,
    status: source.status,
    summary: normalized.summary,
    createdAt: source.createdAt.toISOString(),
  })
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
