import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const catalogSourceStatus = pgEnum('catalog_source_status', [
  'not_collected',
  'active',
  'paused',
  'error',
])

export const catalogSources = pgTable(
  'catalog_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: text('module_id').notNull(),
    displayName: text('display_name').notNull(),
    sourceKey: text('source_key').notNull(),
    status: catalogSourceStatus('status').default('not_collected').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('catalog_sources_module_source_key_unique').on(table.moduleId, table.sourceKey),
  ],
)

export type CatalogSource = typeof catalogSources.$inferSelect
export type NewCatalogSource = typeof catalogSources.$inferInsert
