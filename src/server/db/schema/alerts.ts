import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { sourceListings, sourceListingObservations } from './catalog'
import { savedListingViews } from './saved-listing-views'

export const alertEventTypes = ['new_match', 'price_change', 'availability_change'] as const
export type AlertEventType = typeof alertEventTypes[number]

/** Endpoint and topic are private per-user configuration, never exposed in list APIs. */
export const notificationSettings = pgTable('notification_settings', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  endpoint: text('endpoint').notNull().default('https://ntfy.sh'),
  topic: text('topic'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const notificationDeliveryStatus = pgEnum('notification_delivery_status', ['queued', 'sent', 'failed'])

/**
 * A durable dedupe record. One observed listing may match both a watch and saved
 * view, so the discriminator is part of the unique key rather than coalescing
 * potentially useful notifications.
 */
export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  observationId: uuid('observation_id').references(() => sourceListingObservations.id, { onDelete: 'cascade' }),
  savedViewId: uuid('saved_view_id').references(() => savedListingViews.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  eventType: text('event_type').$type<AlertEventType>().notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  payload: jsonb('payload').$type<{ title: string; body: string; tags?: string[] }>().notNull(),
  status: notificationDeliveryStatus('status').notNull().default('queued'),
  error: text('error'),
  attemptCount: integer('attempt_count').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('notification_deliveries_dedupe_idx').on(table.userId, table.dedupeKey),
  index('notification_deliveries_listing_idx').on(table.listingId, table.createdAt),
  index('notification_deliveries_status_idx').on(table.status, table.createdAt),
])

/** Per-view alert opt-in remains separate from the reusable saved filter itself. */
export const savedViewNotificationRules = pgTable('saved_view_notification_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  savedViewId: uuid('saved_view_id').notNull().references(() => savedListingViews.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  eventTypes: jsonb('event_types').$type<AlertEventType[]>().notNull().default(['new_match', 'price_change', 'availability_change']),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('saved_view_notification_rules_view_idx').on(table.savedViewId),
  index('saved_view_notification_rules_user_idx').on(table.userId),
])
