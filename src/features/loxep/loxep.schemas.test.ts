import { describe, expect, it } from 'vitest'
import { loxepOpportunityEventSchema, loxepOutcomeEventSchema } from './loxep.schemas'

const opportunity = {
  schema: 'hoardcore.loxep.opportunity.v1' as const,
  eventId: '00000000-0000-4000-8000-000000000001',
  occurredAt: '2026-09-22T12:00:00.000Z',
  source: {
    moduleId: 'shopify',
    sourceKey: 'shopify:store',
    listingId: '00000000-0000-4000-8000-000000000002',
    listingKey: 'products/item-1',
    url: 'https://shop.example.test/products/item-1',
  },
  listing: {
    title: 'Example item',
    price: '42.50',
    currency: 'USD',
    available: true,
    stockQuantity: 2,
    observedAt: '2026-09-22T11:59:00.000Z',
  },
  opportunity: {
    decision: 'buy' as const,
    profit: '15.25',
    roiPercent: 36.5,
    targetPrice: '60.00',
    currency: 'USD',
  },
  research: {
    submissionIds: [],
    confidence: 0.8,
    demand: 4,
    liquidity: 3,
    risk: 'low' as const,
    comparables: [],
  },
}

describe('Loxep interchange contracts', () => {
  it('accepts a versioned opportunity and preserves decimal money strings', () => {
    expect(loxepOpportunityEventSchema.parse(opportunity).listing.price).toBe('42.50')
  })

  it('rejects an incompatible version or unknown field', () => {
    expect(() => loxepOpportunityEventSchema.parse({ ...opportunity, schema: 'v2' })).toThrow()
    expect(() => loxepOpportunityEventSchema.parse({ ...opportunity, unexpected: true })).toThrow()
  })

  it('accepts an outcome envelope without treating details as trusted calculations', () => {
    const result = loxepOutcomeEventSchema.parse({
      schema: 'loxep.hoardcore.outcome.v1',
      eventId: '00000000-0000-4000-8000-000000000003',
      occurredAt: '2026-09-22T12:00:00.000Z',
      eventType: 'acquisition.created',
      source: { listingId: opportunity.source.listingId, eventId: null },
      loxep: {
        connectionId: '00000000-0000-4000-8000-000000000004',
        resourceType: 'acquisition',
        resourceId: 'acquisition-1',
        url: null,
      },
      details: { status: 'draft', quantity: 1 },
    })
    expect(result.details).toEqual({ status: 'draft', quantity: 1 })
  })
})
