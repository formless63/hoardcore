import { z } from 'zod'
import { currencyCodeSchema } from '~/lib/currency'

export const provenanceSchema = z.object({ kind: z.enum(['listing_observation', 'research_comparable', 'operator_override']), reference: z.string().trim().max(300).optional() })
const amount = z.number().finite().min(0).max(999_999_999_999.99).nullable()
const percent = z.number().finite().min(0).max(100).nullable()
const quantity = z.number().int().positive().max(1_000_000).nullable()
const assumption = <T extends z.ZodType>(value: T) => z.object({ value, provenance: provenanceSchema })

export const opportunityInputsSchema = z.object({
  quantity: assumption(quantity), acquisitionCost: assumption(amount), estimatedMarketValue: assumption(amount),
  platformFeePercent: assumption(percent), paymentFeePercent: assumption(percent), shipping: assumption(amount), tax: assumption(amount), handling: assumption(amount), otherCosts: assumption(amount), downsidePercent: assumption(percent),
})
export const opportunityAssumptionInputSchema = z.object({ listingId: z.uuid(), currency: currencyCodeSchema.nullable(), inputs: opportunityInputsSchema })
export const opportunityListingIdSchema = z.object({ listingId: z.uuid() })
export type OpportunityInputsWithProvenance = z.output<typeof opportunityInputsSchema>
