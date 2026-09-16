import { customType, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { catalogSources } from './catalog-sources'
import { sourceListings } from './catalog'

const binary = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'bytea' },
})

/**
 * Re-encoded derivatives only.  Keeping binary media here is deliberate for
 * the first deployment shape: one application and one Postgres database.
 */
export const mediaBlobs = pgTable('media_blobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sha256: text('sha256').notNull().unique(),
  contentType: text('content_type').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  byteLength: integer('byte_length').notNull(),
  data: binary('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/** A captured source URL is retained for audit, while consumers use blob IDs. */
export const listingMedia = pgTable('listing_media', {
  id: uuid('id').defaultRandom().primaryKey(),
  listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  sourceUrl: text('source_url').notNull(),
  sourceSha256: text('source_sha256').notNull(),
  sourceContentType: text('source_content_type').notNull(),
  originalWidth: integer('original_width').notNull(),
  originalHeight: integer('original_height').notNull(),
  thumbnailBlobId: uuid('thumbnail_blob_id').notNull().references(() => mediaBlobs.id, { onDelete: 'restrict' }),
  previewBlobId: uuid('preview_blob_id').notNull().references(() => mediaBlobs.id, { onDelete: 'restrict' }),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('listing_media_listing_source_unique_idx').on(table.listingId, table.sourceUrl),
  index('listing_media_listing_idx').on(table.listingId),
])

export const mediaCaptureRunStatus = pgEnum('media_capture_run_status', ['queued', 'running', 'succeeded', 'partial', 'failed'])

/** Durable audit trail for an explicitly initiated media-capture batch. */
export const mediaCaptureRuns = pgTable('media_capture_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => catalogSources.id, { onDelete: 'cascade' }),
  status: mediaCaptureRunStatus('status').notNull().default('queued'),
  requestLimit: integer('request_limit').notNull().default(10),
  requestCount: integer('request_count').notNull().default(0),
  capturedCount: integer('captured_count').notNull().default(0),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('media_capture_runs_one_active_per_source_idx').on(table.sourceId).where(sql`${table.status} in ('queued', 'running')`),
])

export const mediaSchema = { mediaBlobs, listingMedia, mediaCaptureRuns }
