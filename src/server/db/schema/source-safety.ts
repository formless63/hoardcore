import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid, boolean, index } from 'drizzle-orm/pg-core'
import { catalogSources } from './catalog-sources'
import { user } from './auth'
import type { ResponseEventType, ResponsePolicy } from '~/features/sources/response-policy'

export const sourceResponsePolicies = pgTable('source_response_policies', {
  sourceId: uuid('source_id').primaryKey().references(() => catalogSources.id, { onDelete: 'cascade' }),
  policy: jsonb('policy').$type<ResponsePolicy>().notNull(),
})
export const sourceOriginSafety = pgTable('source_origin_safety', {
  origin: text('origin').primaryKey(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  paused: boolean('paused').notNull().default(false),
  throttleStrikes: integer('throttle_strikes').notNull().default(0),
  lastEvent: text('last_event').$type<ResponseEventType>(),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  nextRequestAt: timestamp('next_request_at', { withTimezone: true }),
  lastScanAt: timestamp('last_scan_at', { withTimezone: true }),
  reason: text('reason'),
})
export const sourceResponseSubscriptions = pgTable('source_response_subscriptions', {
  sourceId: uuid('source_id').notNull().references(() => catalogSources.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  eventTypes: jsonb('event_types').$type<ResponseEventType[]>().notNull().default([]),
}, t => [primaryKey({ columns: [t.sourceId, t.userId] })])
export const sourceSafetyEvents = pgTable('source_safety_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => catalogSources.id, { onDelete: 'cascade' }),
  origin: text('origin').notNull(),
  eventType: text('event_type').$type<ResponseEventType | 'operator_break' | 'operator_resume'>().notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [index('source_safety_events_source_idx').on(t.sourceId, t.createdAt)])
