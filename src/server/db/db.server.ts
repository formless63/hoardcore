import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { closePostgresPool, getPostgresPool } from './pool.server'
import * as schema from './schema'

export type Database = ReturnType<typeof createDatabase>

function createDatabase() {
  return drizzle({
    client: getPostgresPool(),
    schema,
  })
}

let database: Database | undefined

export function getDatabase(): Database {
  database ??= createDatabase()
  return database
}

export async function checkDatabaseConnection(): Promise<void> {
  await getDatabase().execute(sql`select 1`)
}

export async function closeDatabase(): Promise<void> {
  database = undefined
  await closePostgresPool()
}
