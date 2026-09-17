import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { sourceListings } from './catalog'

/** One operator-owned, currency-homogeneous economic scenario per listing. */
export const opportunityAssumptions = pgTable('opportunity_assumptions', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  currency: text('currency'), inputs: jsonb('inputs').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('opportunity_assumptions_user_listing_idx').on(table.userId, table.listingId), index('opportunity_assumptions_listing_idx').on(table.listingId)])
