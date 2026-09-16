import { Pool } from 'pg'
import { getServerConfig } from '../config.server'

let pool: Pool | undefined

export function getPostgresPool(): Pool {
  if (pool) {
    return pool
  }

  pool = new Pool({
    connectionString: getServerConfig().DATABASE_URL,
  })

  pool.on('error', (error) => {
    console.error('Unexpected error from an idle PostgreSQL client', error)
  })

  return pool
}

export async function closePostgresPool(): Promise<void> {
  if (!pool) {
    return
  }

  const poolToClose = pool
  pool = undefined
  await poolToClose.end()
}
