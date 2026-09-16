import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'

/** Single-installation operator defaults; this table deliberately has one row. */
export const appSettings = pgTable('app_settings', {
  id: integer('id').primaryKey(),
  defaultCollectionRequestLimit: integer('default_collection_request_limit').notNull().default(3),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
