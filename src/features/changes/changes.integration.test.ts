import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closeDatabase, getDatabase } from '~/server/db/index.server'
import { catalogSources, catalogProducts, catalogVariants, sourceListings, collectionRuns, sourceEvidence, sourceListingObservations } from '~/server/db/schema'
import { readChanges } from './changes.server'
import { changesSearchSchema } from './changes.schemas'

if(process.env.TEST_DATABASE_URL)process.env.DATABASE_URL=process.env.TEST_DATABASE_URL
const suite=process.env.TEST_DATABASE_URL ? describe : describe.skip
suite('catalog changes reconstruction', () => {
  const db=()=>getDatabase()
  let sourceId: string
  const runIds: string[]=[]
  const listingIds: string[]=[]
  const productIds: string[]=[]
  const times=['2026-01-01T10:00:00Z','2026-01-02T10:00:00Z','2026-01-03T10:00:00Z','2026-01-04T10:00:00Z','2026-01-05T10:00:00Z']
  beforeAll(async () => {
    const [source]=await db().insert(catalogSources).values({ moduleId:'test',displayName:'Changes fixture',sourceKey:crypto.randomUUID() }).returning();sourceId=source.id
    for(let i=0;i<5;i++){
      const [run]=await db().insert(collectionRuns).values({ sourceId,status:i===1?'partial':i===3?'not_modified':'succeeded',createdAt:new Date(times[i]),startedAt:new Date(times[i]),observedAt:new Date(times[i]),completedAt:new Date(times[i]) }).returning();runIds.push(run.id)
    }
    for(let i=0;i<55;i++){
      const [product]=await db().insert(catalogProducts).values({ productKey:crypto.randomUUID(),title:`Changes ${i}` }).returning();productIds.push(product.id)
      const [variant]=await db().insert(catalogVariants).values({ productId:product.id,variantKey:crypto.randomUUID(),sku:`CH-${i}` }).returning()
      const [listing]=await db().insert(sourceListings).values({ sourceId,productId:product.id,variantId:variant.id,listingKey:crypto.randomUUID(),url:'https://example.test/item' }).returning();listingIds.push(listing.id)
    }
    for(let i=0;i<5;i++){
      if(i===3)continue
      const [evidence]=await db().insert(sourceEvidence).values({ sourceId,runId:runIds[i],capturedAt:new Date(times[i]),payload:{} }).returning()
      const indices=i===0 ? Array.from({length:54},(_,j)=>j) : i===1 ? [0,54] : i===2 ? [0,54] : [0,1,54]
      for(const j of indices)await db().insert(sourceListingObservations).values({ listingId:listingIds[j],title:`Changes ${j}`,price:j===0 ? (i===0?'100':i===1?'80':i===2?'90':'70') : '10',currency:j===0&&i!==1?null:j===54&&i===4?'EUR':'USD',available:!(j===0&&i===2),stockQuantity:j===0&&i===2?0:5,observedAt:new Date(times[i]),evidenceId:evidence.id })
    }
  })
  afterAll(async()=>{
    if(sourceId)await db().delete(catalogSources).where(eq(catalogSources.id,sourceId))
    if(productIds.length)await db().delete(catalogProducts).where(inArray(catalogProducts.id,productIds))
    await closeDatabase()
  })
  const compare=(before:number,after:number,patch={})=>readChanges(db(),changesSearchSchema.parse({ mode:'runs',sourceId,beforeRunId:runIds[before],afterRunId:runIds[after],...patch }))
  it('reports price drops and new listings without inferring removals from partial scans',async()=>{
    const result=await compare(0,1)
    expect(result.total).toBe(2)
    expect(result.counts.missing??0).toBe(0)
    expect(result.rows.find(row=>row.listingId===listingIds[0])).toMatchObject({ delta:'-20.00',kinds:expect.arrayContaining(['price_drop']) })
    expect(result.rows.find(row=>row.listingId===listingIds[54])?.kinds).toContain('new')
  })
  it('paginates every removal and filters stock/price movements',async()=>{
    const result=await compare(1,2)
    expect(result.total).toBe(54)
    expect(result.counts.missing).toBe(53)
    expect(result.rows).toHaveLength(50)
    expect((await compare(1,2,{page:1})).rows).toHaveLength(4)
    expect((await compare(1,2,{kind:'missing'})).total).toBe(53)
    expect((await compare(1,2,{kind:'stock_changed'})).total).toBe(1)
  })
  it('does not invent removals or observations on a not-modified result',async()=>{
    expect((await compare(2,3)).total).toBe(0)
  })
  it('assumes USD for absent currency without suppressing price filters or rewriting evidence',async()=>{
    const drop=await compare(0,1,{kind:'price_drop'})
    expect(drop.total).toBe(1)
    expect(drop.rows[0]).toMatchObject({ beforeCurrency:'USD',afterCurrency:'USD',delta:'-20.00' })
    expect(drop.rows[0].kinds).not.toContain('currency_changed')
    expect((await compare(1,2,{kind:'price_increase'})).total).toBe(1)
    expect((await compare(3,4,{kind:'price_drop'})).total).toBe(1)
    const raw=await db().select({currency:sourceListingObservations.currency}).from(sourceListingObservations).where(eq(sourceListingObservations.listingId,listingIds[0]))
    expect(raw.filter(row=>row.currency===null)).toHaveLength(3)
  })
  it('reconstructs old presence independently of later reappearances and handles currency changes',async()=>{
    expect((await compare(3,4)).rows.find(row=>row.listingId===listingIds[1])?.kinds).toContain('reappeared')
    const currency=(await compare(3,4)).rows.find(row=>row.listingId===listingIds[54])!
    expect(currency.kinds).toContain('currency_changed');expect(currency.delta).toBeNull()
    expect((await compare(1,2)).counts.missing).toBe(53)
  })
  it('returns intermediate changes in date ranges rather than just endpoint net differences',async()=>{
    const result=await readChanges(db(),changesSearchSchema.parse({ sourceId,from:'2026-01-02T00:00:00Z',to:'2026-01-05T23:59:59Z',query:'CH-0' }))
    expect(result.total).toBe(3)
    expect(result.rows.map(row=>Number(row.delta))).toEqual([-20,10,-20])
  })
  it('compares nonadjacent runs using net state and sorts percentage movements',async()=>{
    const result=await compare(0,4,{kind:'price_drop',sort:'percent'})
    expect(result.total).toBe(1)
    expect(result.rows[0]).toMatchObject({ listingId:listingIds[0],delta:'-30.00' })
    expect(Number(result.rows[0].percent)).toBe(-30)
    // Listing 1 disappeared and returned in between, but is present at both endpoints.
    expect((await compare(0,4)).counts.reappeared??0).toBe(0)
  })
  it('clamps pages past the end and rejects run/source mismatches',async()=>{
    expect((await compare(1,2,{page:999})).page).toBe(1)
    const [other]=await db().insert(catalogSources).values({ moduleId:'test',displayName:'Changes other fixture',sourceKey:crypto.randomUUID() }).returning()
    try {
      await expect(compare(0,1,{sourceId:other.id})).rejects.toThrow('selected source')
    } finally { await db().delete(catalogSources).where(eq(catalogSources.id,other.id)) }
  })
  it('supports the first scan, literal search, empty result counts and invalid run ordering',async()=>{
    const first=await readChanges(db(),changesSearchSchema.parse({ sourceId,from:'2026-01-01T00:00:00Z',to:'2026-01-01T23:59:59Z' }))
    expect(first.total).toBe(54);expect(first.counts.new).toBe(54)
    expect((await compare(0,1,{query:'%'})).total).toBe(0)
    await expect(compare(2,1)).rejects.toThrow('earlier and later')
  })
})
