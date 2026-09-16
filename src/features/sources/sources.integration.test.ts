import { afterAll, beforeEach, describe, expect, it } from 'vitest'
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
  beforeEach(async () => {
    await getDatabase().delete(catalogSources)
  })

  afterAll(async () => {
    await closeDatabase()
  })

  it('persists a normalized module configuration and lists it', async () => {
    const created = await createCatalogSourceInDatabase({
      displayName: 'Example outlet',
      moduleId: 'shopify',
      config: { catalogUrl: 'Example.myshopify.com/collections/sale?sort=price' },
    })

    expect(created).toMatchObject({
      displayName: 'Example outlet',
      moduleId: 'shopify',
      moduleName: 'Shopify',
      status: 'not_collected',
      summary: 'example.myshopify.com/collections/sale',
    })

    await expect(listCatalogSourcesFromDatabase()).resolves.toEqual({ sources: [created] })
  })

  it('rejects duplicate module-defined source identities', async () => {
    await createCatalogSourceInDatabase({
      displayName: 'First name',
      moduleId: 'shopify',
      config: { catalogUrl: 'https://example.myshopify.com/collections/sale' },
    })

    await expect(
      createCatalogSourceInDatabase({
        displayName: 'Second name',
        moduleId: 'shopify',
        config: { catalogUrl: 'https://example.myshopify.com/collections/sale/' },
      }),
    ).rejects.toThrow('That source is already registered')
  })
})
