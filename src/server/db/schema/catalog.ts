import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { catalogSources } from './catalog-sources'

export const catalogProducts = pgTable('catalog_products', {
  id: uuid('id').defaultRandom().primaryKey(),
  productKey: text('product_key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  brand: text('brand'),
  productType: text('product_type'),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const collectionRunStatus = pgEnum('collection_run_status', ['queued', 'running', 'succeeded', 'partial', 'not_modified', 'failed'])
export const collectionRuns = pgTable('collection_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => catalogSources.id, { onDelete: 'cascade' }),
  status: collectionRunStatus('status').notNull().default('queued'),
  requestLimit: integer('request_limit').notNull().default(3),
  requestCount: numeric('request_count', { precision: 10, scale: 0 }).notNull().default('0'),
  pageCount: integer('page_count').notNull().default(0),
  productCount: integer('product_count').notNull().default(0),
  error: text('error'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('collection_runs_one_active_per_source_idx').on(table.sourceId).where(sql`${table.status} in ('queued', 'running')`)])

export const collectionRunEvents = pgTable('collection_run_events', {
  id: serial('id').primaryKey(),
  runId: uuid('run_id').notNull().references(() => collectionRuns.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('collection_run_events_run_idx').on(table.runId, table.id)])

export const catalogVariants = pgTable('catalog_variants', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => catalogProducts.id, { onDelete: 'cascade' }),
  variantKey: text('variant_key').notNull().unique(),
  title: text('title'),
  sku: text('sku'),
  barcode: text('barcode'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sourceListings = pgTable('source_listings', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => catalogSources.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => catalogProducts.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => catalogVariants.id, { onDelete: 'cascade' }),
  listingKey: text('listing_key').notNull().unique(),
  url: text('url').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('source_listings_source_idx').on(table.sourceId), index('source_listings_product_idx').on(table.productId)])

export const sourceListingCurrent = pgTable('source_listing_current', {
  listingId: uuid('listing_id').primaryKey().references(() => sourceListings.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  price: numeric('price', { precision: 14, scale: 2 }),
  currency: text('currency'),
  available: boolean('available').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sourceListingObservations = pgTable('source_listing_observations', {
  id: uuid('id').defaultRandom().primaryKey(),
  listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  title: text('title').notNull(),
  price: numeric('price', { precision: 14, scale: 2 }),
  currency: text('currency'),
  available: boolean('available').notNull(),
  evidenceId: uuid('evidence_id'),
}, (table) => [
  index('source_listing_observations_history_idx').on(table.listingId, table.observedAt),
  uniqueIndex('source_listing_observations_run_unique_idx').on(table.listingId, table.evidenceId),
])

export const sourceEvidence = pgTable('source_evidence', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => catalogSources.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').notNull().references(() => collectionRuns.id, { onDelete: 'cascade' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  contentType: text('content_type'),
  sha256: text('sha256'),
}, (table) => [uniqueIndex('source_evidence_run_unique_idx').on(table.runId)])

export const catalogSchema = { catalogProducts, collectionRuns, collectionRunEvents, catalogVariants, sourceListings, sourceListingCurrent, sourceListingObservations, sourceEvidence }
export type CatalogProduct = typeof catalogProducts.$inferSelect
export type CatalogVariant = typeof catalogVariants.$inferSelect
export type SourceListing = typeof sourceListings.$inferSelect
