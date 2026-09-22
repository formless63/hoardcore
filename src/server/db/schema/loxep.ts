import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { sourceListings } from './catalog'

/** Operator-managed companion connections to a Loxep installation. */
export const loxepConnectionStatus = pgEnum('loxep_connection_status', ['active', 'disabled', 'revoked'])
export const loxepConnectionStatuses = ['active', 'disabled', 'revoked'] as const

export const loxepConnections = pgTable('loxep_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  remoteConnectionId: text('remote_connection_id').notNull(),
  tokenCiphertext: text('token_ciphertext').notNull(),
  tokenNonce: text('token_nonce').notNull(),
  tokenAuthTag: text('token_auth_tag').notNull(),
  callbackTokenHash: text('callback_token_hash').notNull().unique(),
  callbackTokenPrefix: text('callback_token_prefix').notNull(),
  status: loxepConnectionStatus('status').notNull().default('active'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('loxep_connections_user_created_idx').on(table.userId, table.createdAt),
  uniqueIndex('loxep_connections_user_remote_idx').on(table.userId, table.remoteConnectionId),
])

export const loxepDeliveryStatus = pgEnum('loxep_delivery_status', ['pending', 'accepted', 'failed'])

/** One latest publish intent per Hoardcore listing/connection pair. */
export const loxepDeliveries = pgTable('loxep_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').notNull().references(() => loxepConnections.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull().unique(),
  payload: jsonb('payload').$type<unknown>().notNull(),
  status: loxepDeliveryStatus('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastResponseStatus: integer('last_response_status'),
  remoteMarketplaceItemId: text('remote_marketplace_item_id'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('loxep_deliveries_connection_listing_idx').on(table.connectionId, table.listingId),
  index('loxep_deliveries_user_updated_idx').on(table.userId, table.updatedAt),
])

/** Raw, authenticated lifecycle events sent back by Loxep. */
export const loxepOutcomeEvents = pgTable('loxep_outcome_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').notNull().references(() => loxepConnections.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull(),
  eventType: text('event_type').notNull(),
  listingId: uuid('listing_id').references(() => sourceListings.id, { onDelete: 'set null' }),
  payload: jsonb('payload').$type<unknown>().notNull(),
  payloadHash: text('payload_hash').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('loxep_outcome_events_connection_event_idx').on(table.connectionId, table.eventId),
  index('loxep_outcome_events_connection_received_idx').on(table.connectionId, table.receivedAt),
])

export const loxepSchema = { loxepConnections, loxepDeliveries, loxepOutcomeEvents }
