import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogSources, collectionRuns } from '~/server/db/schema'
import {
  createCatalogSourceInDatabase,
  listCatalogSourcesFromDatabase,
  updateSourceCatalogOptionsInDatabase,
  updateSourceScheduleInDatabase,
} from './sources.server'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl
}

describeWithDatabase('catalog source persistence', () => {
  const createdSourceIds: string[] = []

  afterEach(async () => {
    if (createdSourceIds.length) {
      await getDatabase().delete(catalogSources).where(inArray(catalogSources.id, createdSourceIds))
      createdSourceIds.length = 0
    }
  })

  afterAll(async () => {
    await closeDatabase()
  })

  it('persists a normalized module configuration and lists it', async () => {
    const host = `example-${crypto.randomUUID()}.myshopify.com`
    const created = await createCatalogSourceInDatabase({
      displayName: 'Example outlet',
      moduleId: 'shopify',
      config: { catalogUrl: `${host}/collections/sale?sort=price` },
    })
    createdSourceIds.push(created.id)

    expect(created).toMatchObject({
      displayName: 'Example outlet',
      moduleId: 'shopify',
      moduleName: 'Shopify',
      status: 'not_collected',
      summary: `${host}/collections/sale`,
    })

    await expect(listCatalogSourcesFromDatabase()).resolves.toEqual({ sources: expect.arrayContaining([created]) })
  })

  it('rejects duplicate module-defined source identities', async () => {
    const host = `example-${crypto.randomUUID()}.myshopify.com`
    const created = await createCatalogSourceInDatabase({
      displayName: 'First name',
      moduleId: 'shopify',
      config: { catalogUrl: `https://${host}/collections/sale` },
    })
    createdSourceIds.push(created.id)

    await expect(
      createCatalogSourceInDatabase({
        displayName: 'Second name',
        moduleId: 'shopify',
        config: { catalogUrl: `https://${host}/collections/sale/` },
      }),
    ).rejects.toThrow('That source is already registered')
  })

  it('stores an opt-in schedule and can pause collection without deleting the source', async () => {
    const host = `example-${crypto.randomUUID()}.myshopify.com`
    const created = await createCatalogSourceInDatabase({ displayName: 'Scheduled source', moduleId: 'shopify', config: { catalogUrl: `https://${host}/collections/sale` } })
    createdSourceIds.push(created.id)
    expect(created.scheduleCron).toBeNull()
    expect(created.nextRunAt).toBeNull()
    const scheduled = await updateSourceScheduleInDatabase({ sourceId: created.id, collectionEnabled: true, scheduleCron: '0 9,21 * * *', scheduleTimezone: 'America/New_York', scheduleRequestLimit: 10 })
    expect(scheduled).toMatchObject({ collectionEnabled: true, scheduleCron: '0 9,21 * * *', scheduleTimezone: 'America/New_York', scheduleRequestLimit: 10 })
    expect(scheduled.nextRunAt).not.toBeNull()
    const paused = await updateSourceScheduleInDatabase({ sourceId: created.id, collectionEnabled: false, scheduleCron: '0 9,21 * * *', scheduleTimezone: 'America/New_York', scheduleRequestLimit: 10 })
    expect(paused).toMatchObject({ collectionEnabled: false, nextRunAt: null })
  })

  it('updates existing catalog options without losing other config and blocks edits during a run', async () => {
    const host = `example-${crypto.randomUUID()}.myshopify.com`
    const created = await createCatalogSourceInDatabase({ displayName: 'Editable source', moduleId: 'shopify', config: { catalogUrl: `https://${host}/collections/sale` } })
    createdSourceIds.push(created.id)
    const [stored] = await getDatabase().select().from(catalogSources).where(inArray(catalogSources.id, [created.id]))
    await getDatabase().update(catalogSources).set({ config: { ...stored!.config, futureSetting: 'preserve' } }).where(inArray(catalogSources.id, [created.id]))

    const updated = await updateSourceCatalogOptionsInDatabase({ sourceId: created.id, currency: 'USD', stockCardsEnabled: true, robotsPolicy: 'operator_approved' })
    expect(updated).toMatchObject({ currency: 'USD', stockCardsEnabled: true, robotsPolicy: 'operator_approved', scheduleCron: null })
    const [configured] = await getDatabase().select({ config: catalogSources.config }).from(catalogSources).where(inArray(catalogSources.id, [created.id]))
    expect(configured?.config).toMatchObject({ currency: 'USD', stockCardsEnabled: true, robotsPolicy: 'operator_approved', futureSetting: 'preserve' })

    await getDatabase().insert(collectionRuns).values({ sourceId: created.id, status: 'queued' })
    await expect(updateSourceCatalogOptionsInDatabase({ sourceId: created.id, currency: '', stockCardsEnabled: false, robotsPolicy: 'respect' })).rejects.toThrow('active collection')
  })
})
