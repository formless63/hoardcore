import type { NormalizedCatalogRecord } from '../../modules/types'
import { and, asc, count, desc, eq, gt, gte, ilike, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { catalogProducts, catalogVariants, collectionRuns, sourceCategoryGroupOverrides, sourceEvidence, sourceListingCurrent, sourceListingObservations, sourceListings } from './schema/catalog'
import { catalogSources } from './schema/catalog-sources'
import type { Database } from './db.server'
import { getListingMediaCaptures } from '~/features/media/media.server'
import { resolvedCategoryGroup } from '~/features/catalog/category-overrides.server'
import type { CurrentListingsPageInput } from '~/features/catalog/catalog.schemas'
import type { ListingFilters } from '~/features/catalog/listing-filters'

export interface CatalogObservationInput {
  observedAt?: Date
  evidence?: { payload: unknown; contentType?: string; sha256?: string }
  runId?: string
  /** Only a complete successful snapshot may reconcile omitted listings as missing. */
  complete?: boolean
}

export async function listCurrentCatalogListings(db: Database) {
  const listings = await db.select({
    id: sourceListings.id,
    url: sourceListings.url,
    sourceId: catalogSources.id,
    sourceName: catalogSources.displayName,
    moduleId: catalogSources.moduleId,
    productId: catalogProducts.id,
    productTitle: catalogProducts.title,
    manufacturer: catalogProducts.brand,
    category: catalogProducts.productType,
    categoryGroupOverride: sourceCategoryGroupOverrides.categoryGroup,
    tags: catalogProducts.tags,
    variantId: catalogVariants.id,
    variantTitle: catalogVariants.title,
    sku: catalogVariants.sku,
    imageUrl: sourceListings.imageUrl,
    title: sourceListingCurrent.title,
    price: sourceListingCurrent.price,
    compareAtPrice: sourceListingCurrent.compareAtPrice,
    currency: sourceListingCurrent.currency,
    available: sourceListingCurrent.available,
    stockQuantity: sourceListingCurrent.stockQuantity,
    presence: sourceListingCurrent.presence,
    observedAt: sourceListingCurrent.observedAt,
  }).from(sourceListingCurrent)
    .innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId))
    .innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
    .leftJoin(sourceCategoryGroupOverrides, and(
      eq(sourceCategoryGroupOverrides.sourceId, sourceListings.sourceId),
      eq(sourceCategoryGroupOverrides.sourceCategory, catalogProducts.productType),
    )).where(eq(sourceListingCurrent.presence, 'present'))
  const captures = await getListingMediaCaptures(db, listings.map((listing) => listing.id))
  return listings.map(({ categoryGroupOverride, ...listing }) => ({
    ...listing,
    categoryGroup: resolvedCategoryGroup(listing.category, categoryGroupOverride),
    mediaCaptureId: captures.get(listing.id)?.id ?? null,
  }))
}

type ListingFacetCategoryRow = { sourceId: string; category: string | null; categoryGroupOverride: string | null; listingCount: number | string }

function currentListingSelect() {
  return {
    id: sourceListings.id, url: sourceListings.url, sourceId: catalogSources.id, sourceName: catalogSources.displayName, moduleId: catalogSources.moduleId,
    productId: catalogProducts.id, productTitle: catalogProducts.title, manufacturer: catalogProducts.brand, category: catalogProducts.productType,
    categoryGroupOverride: sourceCategoryGroupOverrides.categoryGroup, tags: catalogProducts.tags, variantId: catalogVariants.id, variantTitle: catalogVariants.title,
    sku: catalogVariants.sku, imageUrl: sourceListings.imageUrl, title: sourceListingCurrent.title, price: sourceListingCurrent.price,
    compareAtPrice: sourceListingCurrent.compareAtPrice, currency: sourceListingCurrent.currency, available: sourceListingCurrent.available,
    stockQuantity: sourceListingCurrent.stockQuantity, presence: sourceListingCurrent.presence, observedAt: sourceListingCurrent.observedAt,
  }
}

async function categoryGroupFilter(db: Database, categoryGroup: string): Promise<SQL | undefined> {
  if (!categoryGroup) return undefined
  const rows = await db.select({ sourceId: sourceListings.sourceId, category: catalogProducts.productType, categoryGroupOverride: sourceCategoryGroupOverrides.categoryGroup })
    .from(sourceListingCurrent).innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
    .leftJoin(sourceCategoryGroupOverrides, and(eq(sourceCategoryGroupOverrides.sourceId, sourceListings.sourceId), eq(sourceCategoryGroupOverrides.sourceCategory, catalogProducts.productType)))
    .groupBy(sourceListings.sourceId, catalogProducts.productType, sourceCategoryGroupOverrides.categoryGroup)
  const pairs = rows.filter((row) => resolvedCategoryGroup(row.category, row.categoryGroupOverride) === categoryGroup)
  if (!pairs.length) return sql`false`
  return or(...pairs.map((row) => and(eq(sourceListings.sourceId, row.sourceId), row.category === null ? isNull(catalogProducts.productType) : eq(catalogProducts.productType, row.category))))
}

function listingFilterConditions(filters: ListingFilters, categoryGroup: SQL | undefined): SQL[] {
  const conditions: SQL[] = []
  if (filters.presence !== 'all') conditions.push(eq(sourceListingCurrent.presence, filters.presence))
  if (categoryGroup) conditions.push(categoryGroup)
  if (filters.query) {
    // `includes` in the former client-side implementation treated these as
    // literal characters. Preserve that behavior instead of accepting SQL
    // wildcard syntax through a search box.
    const needle = `%${filters.query.replace(/[\\%_]/g, '\\$&')}%`
    conditions.push(or(ilike(catalogProducts.title, needle), ilike(sourceListingCurrent.title, needle), ilike(catalogVariants.title, needle), ilike(catalogProducts.brand, needle), ilike(catalogProducts.productType, needle), ilike(catalogSources.displayName, needle), ilike(catalogSources.moduleId, needle), ilike(catalogVariants.sku, needle), sql`cast(${catalogProducts.tags} as text) ilike ${needle}`)!)
  }
  if (filters.category) conditions.push(eq(catalogProducts.productType, filters.category))
  if (filters.manufacturer) conditions.push(eq(catalogProducts.brand, filters.manufacturer))
  if (filters.sourceId) conditions.push(eq(sourceListings.sourceId, filters.sourceId))
  if (filters.stock !== 'all') conditions.push(eq(sourceListingCurrent.available, filters.stock === 'in'))
  if (filters.currency) conditions.push(eq(sourceListingCurrent.currency, filters.currency))
  const hasAbsoluteAmountFilter = filters.minPrice !== null || filters.maxPrice !== null || filters.minDiscountAmount !== null || filters.maxDiscountAmount !== null
  if (hasAbsoluteAmountFilter && !filters.currency) conditions.push(sql`false`)
  if (filters.minPrice !== null) conditions.push(gte(sourceListingCurrent.price, String(filters.minPrice)))
  if (filters.maxPrice !== null) conditions.push(lte(sourceListingCurrent.price, String(filters.maxPrice)))
  const discountAmount = sql`${sourceListingCurrent.compareAtPrice} - ${sourceListingCurrent.price}`
  const discountPercent = sql`(${discountAmount} / nullif(${sourceListingCurrent.compareAtPrice}, 0)) * 100`
  const hasDiscount = and(isNotNull(sourceListingCurrent.price), isNotNull(sourceListingCurrent.compareAtPrice), gt(sourceListingCurrent.compareAtPrice, sourceListingCurrent.price))
  if (filters.minDiscountAmount !== null) conditions.push(and(hasDiscount, gte(discountAmount, String(filters.minDiscountAmount)))!)
  if (filters.maxDiscountAmount !== null) conditions.push(and(hasDiscount, lte(discountAmount, String(filters.maxDiscountAmount)))!)
  if (filters.minDiscountPercent !== null) conditions.push(and(hasDiscount, gte(discountPercent, String(filters.minDiscountPercent)))!)
  if (filters.maxDiscountPercent !== null) conditions.push(and(hasDiscount, lte(discountPercent, String(filters.maxDiscountPercent)))!)
  return conditions
}

function ordered(expression: SQL, descending: boolean): SQL { return descending ? sql`${expression} desc nulls last` : sql`${expression} asc nulls last` }

function listingOrder(sorting: CurrentListingsPageInput['sorting']): SQL[] {
  const discount = sql`case when ${sourceListingCurrent.compareAtPrice} > ${sourceListingCurrent.price} then ((${sourceListingCurrent.compareAtPrice} - ${sourceListingCurrent.price}) / nullif(${sourceListingCurrent.compareAtPrice}, 0)) * 100 else null end`
  const fields: Record<string, SQL> = {
    manufacturer: sql`${catalogProducts.brand}`, productTitle: sql`${catalogProducts.title}`, category: sql`${catalogProducts.productType}`, sku: sql`${catalogVariants.sku}`,
    price: sql`${sourceListingCurrent.price}`, compareAtPrice: sql`${sourceListingCurrent.compareAtPrice}`, discount, available: sql`${sourceListingCurrent.available}`,
    quantity: sql`${sourceListingCurrent.stockQuantity}`, sourceName: sql`${catalogSources.displayName}`, observedAt: sql`${sourceListingCurrent.observedAt}`,
    variantTitle: sql`${catalogVariants.title}`, moduleId: sql`${catalogSources.moduleId}`,
  }
  const selected = sorting.flatMap(({ id, desc: descending }) => fields[id] ? [ordered(fields[id]!, descending)] : [])
  return [...selected, ...(selected.length ? [] : [desc(sourceListingCurrent.observedAt)]), asc(sourceListings.id)]
}

async function listCurrentListingFacets(db: Database) {
  const [categoryRows, manufacturerRows, sourceRows] = await Promise.all([
    db.select({ sourceId: sourceListings.sourceId, category: catalogProducts.productType, categoryGroupOverride: sourceCategoryGroupOverrides.categoryGroup, listingCount: count(sourceListings.id) })
      .from(sourceListingCurrent).innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId)).innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId))
      .leftJoin(sourceCategoryGroupOverrides, and(eq(sourceCategoryGroupOverrides.sourceId, sourceListings.sourceId), eq(sourceCategoryGroupOverrides.sourceCategory, catalogProducts.productType)))
      .groupBy(sourceListings.sourceId, catalogProducts.productType, sourceCategoryGroupOverrides.categoryGroup),
    db.selectDistinct({ value: catalogProducts.brand }).from(sourceListingCurrent).innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId)).innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId)).where(isNotNull(catalogProducts.brand)).orderBy(asc(catalogProducts.brand)),
    db.selectDistinct({ id: catalogSources.id, name: catalogSources.displayName }).from(sourceListingCurrent).innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId)).innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId)).orderBy(asc(catalogSources.displayName)),
  ])
  const categories = new Map<string, { groups: Set<string>; count: number }>()
  const categoryGroupCounts: Record<string, number> = {}
  for (const row of categoryRows as ListingFacetCategoryRow[]) {
    const group = resolvedCategoryGroup(row.category, row.categoryGroupOverride)
    const listingCount = Number(row.listingCount)
    if (row.category?.trim()) {
      const category = categories.get(row.category) ?? { groups: new Set<string>(), count: 0 }
      category.groups.add(group); category.count += listingCount; categories.set(row.category, category)
    }
    categoryGroupCounts[group] = (categoryGroupCounts[group] ?? 0) + listingCount
  }
  return {
    categories: [...categories.entries()].map(([value, item]) => ({ value, categoryGroups: [...item.groups].sort(), count: item.count })).sort((a, b) => a.value.localeCompare(b.value)),
    manufacturers: manufacturerRows.flatMap((row) => row.value ? [row.value] : []), sources: sourceRows, categoryGroupCounts,
  }
}

/** A server-side filtered catalog page plus compact selector facets. */
export async function listCurrentCatalogListingsPage(db: Database, input: CurrentListingsPageInput) {
  const categoryGroup = await categoryGroupFilter(db, input.filters.categoryGroup)
  const conditions = listingFilterConditions(input.filters, categoryGroup)
  const where = conditions.length ? and(...conditions) : undefined
  const base = db.select(currentListingSelect()).from(sourceListingCurrent)
    .innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId)).innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId)).innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
    .leftJoin(sourceCategoryGroupOverrides, and(eq(sourceCategoryGroupOverrides.sourceId, sourceListings.sourceId), eq(sourceCategoryGroupOverrides.sourceCategory, catalogProducts.productType)))
  const countQuery = db.select({ total: count() }).from(sourceListingCurrent)
    .innerJoin(sourceListings, eq(sourceListings.id, sourceListingCurrent.listingId)).innerJoin(catalogSources, eq(catalogSources.id, sourceListings.sourceId))
    .innerJoin(catalogProducts, eq(catalogProducts.id, sourceListings.productId)).innerJoin(catalogVariants, eq(catalogVariants.id, sourceListings.variantId))
    .leftJoin(sourceCategoryGroupOverrides, and(eq(sourceCategoryGroupOverrides.sourceId, sourceListings.sourceId), eq(sourceCategoryGroupOverrides.sourceCategory, catalogProducts.productType)))
  const [totalRow, rows, facets] = await Promise.all([
    where ? countQuery.where(where) : countQuery,
    (where ? base.where(where) : base).orderBy(...listingOrder(input.sorting)).limit(input.pageSize).offset(input.page * input.pageSize),
    listCurrentListingFacets(db),
  ])
  const total = Number(totalRow[0]?.total ?? 0)
  const captures = await getListingMediaCaptures(db, rows.map((listing) => listing.id))
  return {
    listings: rows.map(({ categoryGroupOverride, ...listing }) => ({ ...listing, categoryGroup: resolvedCategoryGroup(listing.category, categoryGroupOverride), mediaCaptureId: captures.get(listing.id)?.id ?? null })),
    total, page: input.page, pageSize: input.pageSize, pageCount: Math.max(1, Math.ceil(total / input.pageSize)), facets,
  }
}

/** Atomically reconciles current catalog state while retaining every supplied observation. */
export async function persistCatalogSnapshot(
  db: Database,
  sourceId: string,
  records: readonly NormalizedCatalogRecord[],
  input: CatalogObservationInput = {},
) {
  if (input.complete && !input.runId) throw new Error('A complete snapshot needs a run ID for absence evidence')
  const observedAt = input.observedAt ?? new Date()
  return db.transaction(async (tx) => {
    const persisted = []
    const listingKeys = records.map((record) => record.listing.listingKey)
    let evidenceId: string | undefined
    if (input.evidence && input.runId) {
      const [evidence] = await tx.insert(sourceEvidence)
        .values({ sourceId, runId: input.runId, capturedAt: observedAt, ...input.evidence })
        .onConflictDoUpdate({
          target: sourceEvidence.runId,
          set: { capturedAt: observedAt, ...input.evidence },
        })
        .returning({ id: sourceEvidence.id })
      evidenceId = evidence.id
    }
    for (const record of records) {
      const [product] = await tx.insert(catalogProducts).values({
        productKey: record.product.productKey,
        title: record.product.title,
        description: record.product.description,
        brand: record.product.brand,
        productType: record.product.productType,
        tags: record.product.tags,
        imageUrls: record.product.imageUrls ?? [],
        updatedAt: observedAt,
      }).onConflictDoUpdate({ target: catalogProducts.productKey, set: {
        title: record.product.title, description: record.product.description, brand: record.product.brand,
        productType: record.product.productType, tags: record.product.tags,
        ...(record.product.imageUrls !== undefined ? { imageUrls: record.product.imageUrls } : {}), updatedAt: observedAt,
      } }).returning({ id: catalogProducts.id })
      const [variant] = await tx.insert(catalogVariants).values({
        productId: product.id, variantKey: record.variant.variantKey, title: record.variant.title,
        sku: record.variant.sku, barcode: record.variant.barcode, updatedAt: observedAt,
      }).onConflictDoUpdate({ target: catalogVariants.variantKey, set: {
        productId: product.id, title: record.variant.title, sku: record.variant.sku, barcode: record.variant.barcode, updatedAt: observedAt,
      } }).returning({ id: catalogVariants.id })
      const [listing] = await tx.insert(sourceListings).values({
        sourceId, productId: product.id, variantId: variant.id, listingKey: record.listing.listingKey,
        url: record.listing.url, imageUrl: record.listing.imageUrl, updatedAt: observedAt,
      }).onConflictDoUpdate({ target: sourceListings.listingKey, set: {
        sourceId, productId: product.id, variantId: variant.id, url: record.listing.url, imageUrl: record.listing.imageUrl, updatedAt: observedAt,
      } }).returning({ id: sourceListings.id })
      await tx.insert(sourceListingObservations).values({
        listingId: listing.id, observedAt, title: record.listing.current.title, price: record.listing.current.price?.toFixed(2),
        compareAtPrice: record.listing.current.compareAtPrice?.toFixed(2),
        currency: record.listing.current.currency, available: record.listing.current.available, stockQuantity: record.listing.current.stockQuantity, evidenceId,
      }).onConflictDoNothing({ target: [sourceListingObservations.listingId, sourceListingObservations.evidenceId] })
      await tx.insert(sourceListingCurrent).values({
        listingId: listing.id, observedAt, title: record.listing.current.title, price: record.listing.current.price?.toFixed(2),
        compareAtPrice: record.listing.current.compareAtPrice?.toFixed(2),
        currency: record.listing.current.currency, available: record.listing.current.available, presence: 'present', firstSeenAt: observedAt, lastSeenAt: observedAt, missingSince: null, missingRunId: null, reappearedAt: null, reappearedRunId: null, stockQuantity: record.listing.current.stockQuantity, updatedAt: observedAt,
      }).onConflictDoUpdate({ target: sourceListingCurrent.listingId, set: {
        observedAt, title: record.listing.current.title, price: record.listing.current.price?.toFixed(2),
        compareAtPrice: record.listing.current.compareAtPrice?.toFixed(2),
        currency: record.listing.current.currency, available: record.listing.current.available, presence: 'present', lastSeenAt: observedAt, missingSince: null, missingRunId: null, reappearedAt: sql`case when ${sourceListingCurrent.presence} = 'missing' then ${observedAt} else ${sourceListingCurrent.reappearedAt} end`, reappearedRunId: sql`case when ${sourceListingCurrent.presence} = 'missing' then ${input.runId ?? null} else ${sourceListingCurrent.reappearedRunId} end`, stockQuantity: record.listing.current.stockQuantity, updatedAt: observedAt,
      } })
      persisted.push({ productId: product.id, variantId: variant.id, listingId: listing.id })
    }
    if (input.complete) {
      const omitted = listingKeys.length
        ? sql`${sourceListings.listingKey} not in (${sql.join(listingKeys.map((key) => sql`${key}`), sql`, `)})`
        : sql`true`
      await tx.update(sourceListingCurrent).set({ presence: 'missing', missingSince: sql`coalesce(${sourceListingCurrent.missingSince}, ${observedAt})`, missingRunId: sql`coalesce(${sourceListingCurrent.missingRunId}, ${input.runId ?? null})`, updatedAt: observedAt })
        .where(sql`${sourceListingCurrent.listingId} in (select ${sourceListings.id} from ${sourceListings} where ${sourceListings.sourceId} = ${sourceId} and ${omitted})`)
    }
    return persisted
  })
}
