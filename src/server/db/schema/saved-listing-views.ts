import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import type { ListingFilters } from '~/features/catalog/listing-filters'
import type { z } from 'zod'
import { defaultListingPresentation, type listingPresentationSchema } from '~/features/catalog/listing-workbench-state'

export const savedListingViews = pgTable('saved_listing_views', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<ListingFilters>().notNull(),
  presentation: jsonb('presentation').$type<z.output<typeof listingPresentationSchema>>().default(defaultListingPresentation).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('saved_listing_views_user_name_idx').on(table.userId, table.name),
  index('saved_listing_views_user_idx').on(table.userId),
])
