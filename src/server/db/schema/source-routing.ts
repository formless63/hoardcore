import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { catalogSources } from './catalog-sources'
import type { EncryptedProxyPassword } from '~/features/sources/source-routing.schemas'

export const sourceRouting = pgTable('source_routing', {
  sourceId: uuid('source_id').primaryKey().references(() => catalogSources.id, { onDelete: 'cascade' }),
  mode: text('mode').$type<'direct' | 'http_proxy'>().notNull(),
  transport: text('transport').$type<'http' | 'browser'>().notNull().default('http'),
  endpoint: text('endpoint').notNull().default(''),
  username: text('username').notNull().default(''),
  encryptedPassword: jsonb('encrypted_password').$type<EncryptedProxyPassword>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
