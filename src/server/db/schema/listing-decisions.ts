import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { sourceListings } from './catalog'

/** Legacy states remain valid so existing records retain their exact meaning. */
export const legacyListingDecisionStates = ['unreviewed', 'researching', 'pass', 'buy_candidate'] as const
export const reviewDecisionStates = ['interesting', 'watch', 'ignore', 'buy', 'archived'] as const
export const listingDecisionStates = [...legacyListingDecisionStates, ...reviewDecisionStates] as const
export const listingDecisionState = pgEnum('listing_decision_state', listingDecisionStates)
export const listingDecisions = pgTable('listing_decisions', {
  id: uuid('id').defaultRandom().primaryKey(), userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }), listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }),
  state: listingDecisionState('state').notNull().default('interesting'), note: text('note').notNull().default(''), expectedQuantity: integer('expected_quantity'), updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex('listing_decisions_user_listing_idx').on(table.userId, table.listingId), index('listing_decisions_listing_idx').on(table.listingId)])

/** Immutable audit trail for a user's state changes. */
export const listingDecisionTransitions = pgTable('listing_decision_transitions', {
  id: uuid('id').defaultRandom().primaryKey(), listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }), actorId: text('actor_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  fromState: listingDecisionState('from_state'), toState: listingDecisionState('to_state').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('listing_decision_transitions_listing_created_idx').on(table.listingId, table.createdAt)])

/** Shared notes are separate from listingDecisions.note, which remains private. */
export const listingSharedDecisionNotes = pgTable('listing_shared_decision_notes', {
  id: uuid('id').defaultRandom().primaryKey(), listingId: uuid('listing_id').notNull().references(() => sourceListings.id, { onDelete: 'cascade' }), authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('listing_shared_decision_notes_listing_created_idx').on(table.listingId, table.createdAt)])
