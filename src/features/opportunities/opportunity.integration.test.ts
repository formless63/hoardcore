import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogProducts, catalogSources, catalogVariants, opportunityAssumptions, sourceListings, user } from '~/server/db/schema'
import { getOpportunityAssumptions, saveOpportunityAssumptions } from './opportunity.server'
import type { OpportunityInputsWithProvenance } from './opportunity.schemas'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip
const suffix = `opportunity-${Date.now()}-${Math.random().toString(36).slice(2)}`
const inputs: OpportunityInputsWithProvenance = { quantity: { value: 1, provenance: { kind: 'operator_override' } }, acquisitionCost: { value: 10, provenance: { kind: 'listing_observation', reference: 'observation-1' } }, estimatedMarketValue: { value: 20, provenance: { kind: 'research_comparable', reference: 'comparable-1' } }, platformFeePercent: { value: 10, provenance: { kind: 'operator_override' } }, paymentFeePercent: { value: 3, provenance: { kind: 'operator_override' } }, shipping: { value: 2, provenance: { kind: 'operator_override' } }, tax: { value: 1, provenance: { kind: 'operator_override' } }, handling: { value: 0, provenance: { kind: 'operator_override' } }, otherCosts: { value: 0, provenance: { kind: 'operator_override' } }, downsidePercent: { value: 20, provenance: { kind: 'operator_override' } } }

describeWithDatabase('opportunity assumptions', () => {
  let sourceId = ''; let listingId = ''; const userId = `${suffix}-user`; const db = () => getDatabase()
  afterEach(async () => { if (sourceId) await db().delete(catalogSources).where(eq(catalogSources.id, sourceId)); await db().delete(user).where(eq(user.id, userId)); sourceId = '' })
  afterAll(async () => { await closeDatabase() })
  it('persists user-scoped, explicitly sourced assumptions independently from listings', async () => {
    const now = new Date(); await db().insert(user).values({ id: userId, name: 'Operator', email: `${userId}@example.test`, createdAt: now, updatedAt: now })
    const [source] = await db().insert(catalogSources).values({ moduleId: 'test', displayName: suffix, sourceKey: suffix, config: {} }).returning({ id: catalogSources.id }); sourceId = source!.id
    const [product] = await db().insert(catalogProducts).values({ productKey: suffix, title: 'Fixture', tags: [] }).returning({ id: catalogProducts.id }); const [variant] = await db().insert(catalogVariants).values({ productId: product!.id, variantKey: suffix, title: 'Default' }).returning({ id: catalogVariants.id }); const [listing] = await db().insert(sourceListings).values({ sourceId, productId: product!.id, variantId: variant!.id, listingKey: suffix, url: `https://example.test/${suffix}` }).returning({ id: sourceListings.id }); listingId = listing!.id
    await saveOpportunityAssumptions(db(), userId, { listingId, currency: 'USD', inputs }); await saveOpportunityAssumptions(db(), userId, { listingId, currency: 'USD', inputs: { ...inputs, shipping: { value: 4, provenance: { kind: 'operator_override' } } } })
    expect(await getOpportunityAssumptions(db(), userId, listingId)).toMatchObject({ currency: 'USD', inputs: { acquisitionCost: { provenance: { kind: 'listing_observation', reference: 'observation-1' } }, shipping: { value: 4 } } })
    expect(await db().select().from(opportunityAssumptions).where(eq(opportunityAssumptions.listingId, listingId))).toHaveLength(1)
  })
})
