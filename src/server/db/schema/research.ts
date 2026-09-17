import { index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { catalogProducts, catalogVariants, sourceListings } from './catalog'
import { user } from './auth'

export const researchSubmissionStatus = pgEnum('research_submission_status', ['valid', 'partial', 'invalid'])
export const researchComparableEvidenceType = pgEnum('research_comparable_evidence_type', ['active_asking', 'completed_sale', 'retail_offer'])

/** Immutable export packet, retained so every imported result can be audited. */
export const researchBatches = pgTable('research_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  packetId: text('packet_id').notNull().unique(),
  createdByUserId: text('created_by_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  packet: jsonb('packet').$type<unknown>().notNull(),
  prompt: text('prompt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('research_batches_user_created_idx').on(table.createdByUserId, table.createdAt),
  index('research_batches_packet_gin_idx').using('gin', table.packet),
])

/** An append-only raw submission plus its validated result envelope. */
export const researchSubmissions = pgTable('research_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  batchId: uuid('batch_id').notNull().references(() => researchBatches.id, { onDelete: 'cascade' }),
  submittedByUserId: text('submitted_by_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  resultId: text('result_id').notNull(),
  status: researchSubmissionStatus('status').notNull(),
  rawPayload: text('raw_payload').notNull(),
  normalizedPayload: jsonb('normalized_payload').$type<unknown>(),
  diagnostics: jsonb('diagnostics').$type<unknown>().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('research_submissions_batch_result_unique_idx').on(table.batchId, table.resultId),
  index('research_submissions_batch_created_idx').on(table.batchId, table.createdAt),
])

/** Normalized individual evidence rows, kept separate from the immutable raw submission. */
export const researchComparables = pgTable('research_comparables', {
  id: uuid('id').defaultRandom().primaryKey(),
  submissionId: uuid('submission_id').notNull().references(() => researchSubmissions.id, { onDelete: 'cascade' }),
  sourceListingId: uuid('source_listing_id').references(() => sourceListings.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => catalogProducts.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').references(() => catalogVariants.id, { onDelete: 'cascade' }),
  comparableId: text('comparable_id').notNull(),
  channel: text('channel').notNull(),
  evidenceType: researchComparableEvidenceType('evidence_type').notNull(),
  price: numeric('price', { precision: 14, scale: 2 }).notNull(),
  shipping: numeric('shipping', { precision: 14, scale: 2 }),
  currency: text('currency').notNull(),
  condition: text('condition'),
  observedAt: timestamp('observed_at', { withTimezone: true }),
  soldAt: timestamp('sold_at', { withTimezone: true }),
  sampleSize: integer('sample_size'),
  sampleWindow: text('sample_window'),
  url: text('url'),
  citationId: text('citation_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('research_comparables_submission_comparable_unique_idx').on(table.submissionId, table.comparableId),
  index('research_comparables_listing_created_idx').on(table.sourceListingId, table.createdAt),
  index('research_comparables_variant_created_idx').on(table.variantId, table.createdAt),
])

/** Revocable, hashed bearer credentials for external coding/research agents. */
export const researchApiTokens = pgTable('research_api_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('research_api_tokens_user_created_idx').on(table.userId, table.createdAt)])

export const researchSchema = { researchBatches, researchSubmissions, researchComparables, researchApiTokens }
