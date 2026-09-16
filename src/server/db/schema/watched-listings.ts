import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { sourceListings } from './catalog'

/** A private, per-user decision to follow one source listing. */
export const watchedListings = pgTable('watched_listings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  alertsEnabled: boolean('alerts_enabled').notNull().default(false),
  eventTypes: jsonb('event_types').$type<WatchAlertEventType[]>().notNull().default(['new_match', 'price_change', 'availability_change']),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('watched_listings_user_listing_idx').on(table.userId, table.listingId),
  index('watched_listings_listing_idx').on(table.listingId),
])

export type WatchAlertEventType = 'new_match' | 'price_change' | 'availability_change'
