import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'
import { getServerConfig } from './src/server/config.server'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: getServerConfig().DATABASE_URL,
  },
})
