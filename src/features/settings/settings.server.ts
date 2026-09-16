import { eq } from 'drizzle-orm'
import { getDatabase } from '~/server/db/index.server'
import { appSettings } from '~/server/db/schema'

const SETTINGS_ID = 1

export async function readOperatorSettingsFromDatabase() {
  const [row] = await getDatabase().select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID))
  return { defaultCollectionRequestLimit: row?.defaultCollectionRequestLimit ?? 3 }
}

export async function saveOperatorSettingsToDatabase(defaultCollectionRequestLimit: number) {
  await getDatabase().insert(appSettings)
    .values({ id: SETTINGS_ID, defaultCollectionRequestLimit })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { defaultCollectionRequestLimit, updatedAt: new Date() },
    })
  return { defaultCollectionRequestLimit }
}
