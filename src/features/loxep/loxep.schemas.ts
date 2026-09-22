import { z } from 'zod'

const timestamp = z.iso.datetime({ offset: true })
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/u)
const signedDecimal = z.string().regex(/^-?\d+(?:\.\d+)?$/u)

export const loxepOpportunityEventSchema = z.strictObject({
  schema: z.literal('hoardcore.loxep.opportunity.v1'),
  eventId: z.uuid(),
  occurredAt: timestamp,
  source: z.strictObject({
    moduleId: z.string().trim().min(1).max(80),
    sourceKey: z.string().trim().min(1).max(300),
    listingId: z.uuid(),
    listingKey: z.string().trim().min(1).max(500),
    url: z.url(),
  }),
  listing: z.strictObject({
    title: z.string().trim().min(1).max(1_000),
    price: decimal.nullable(),
    currency: z.string().trim().length(3).nullable(),
    available: z.boolean(),
    stockQuantity: z.number().int().nonnegative().nullable(),
    observedAt: timestamp,
  }),
  opportunity: z.strictObject({
    decision: z.enum(['buy', 'buy_candidate']),
    profit: signedDecimal.nullable(),
    roiPercent: z.number().finite().nullable(),
    targetPrice: decimal.nullable(),
    currency: z.string().trim().length(3).nullable(),
  }),
  research: z.strictObject({
    submissionIds: z.array(z.uuid()).max(20),
    confidence: z.number().finite().min(0).max(1).nullable(),
    demand: z.number().finite().nullable(),
    liquidity: z.number().finite().nullable(),
    risk: z.enum(['low', 'medium', 'high', 'critical']).nullable(),
    comparables: z.array(z.strictObject({
      channel: z.string().trim().min(1).max(120),
      evidenceType: z.enum(['active_asking', 'completed_sale', 'retail_offer']),
      price: decimal,
      shipping: decimal.nullable(),
      currency: z.string().trim().length(3),
      condition: z.string().trim().max(200).nullable(),
      observedAt: timestamp.nullable(),
      soldAt: timestamp.nullable(),
      url: z.url().nullable(),
      notes: z.string().max(1_000).nullable(),
    })).max(50),
  }),
})

export const loxepOutcomeEventSchema = z.strictObject({
  schema: z.literal('loxep.hoardcore.outcome.v1'),
  eventId: z.uuid(),
  occurredAt: timestamp,
  eventType: z.enum(['acquisition.created', 'inventory.received', 'listing.active', 'order.sold', 'order.refunded', 'opportunity.dismissed']),
  source: z.strictObject({
    listingId: z.uuid(),
    eventId: z.uuid().nullable(),
  }),
  loxep: z.strictObject({
    connectionId: z.uuid(),
    resourceType: z.string().trim().min(1).max(100),
    resourceId: z.string().trim().min(1).max(200),
    url: z.url().nullable(),
  }),
  details: z.record(z.string(), z.unknown()),
})

export type LoxepOpportunityEvent = z.output<typeof loxepOpportunityEventSchema>
export type LoxepOutcomeEvent = z.output<typeof loxepOutcomeEventSchema>
