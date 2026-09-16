import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogSources } from '~/server/db/schema'
import {
  createCatalogSourceInDatabase,
  listCatalogSourcesFromDatabase,
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
})
