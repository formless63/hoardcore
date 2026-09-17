import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { sourceListings } from './catalog'

export const listingDecisionStates = ['unreviewed', 'researching', 'pass', 'buy_candidate'] as const
export const listingDecisionState = pgEnum('listing_decision_state', listingDecisionStates)
export const listingDecisions = pgTable('listing_decisions', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  state: listingDecisionState('state').notNull().default('unreviewed'), note: text('note').notNull().default(''), expectedQuantity: integer('expected_quantity'), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('listing_decisions_user_listing_idx').on(table.userId, table.listingId), index('listing_decisions_listing_idx').on(table.listingId)])
