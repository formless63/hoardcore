import { marketComparableSchema } from './research.schemas'

export interface ManualComparableInput {
  channel: string
  evidenceType: 'active_asking' | 'completed_sale' | 'retail_offer'
  price: string
  shipping: string
  currency: string
  url: string
}

export function validateManualComparable(input: ManualComparableInput) {
  const channel = input.channel.trim()
  const price = input.price.trim()
  const shipping = input.shipping.trim()
  if (!channel && !price && !shipping) return { status: 'empty' as const }
  if (!channel || !price) return { status: 'invalid' as const, message: 'Enter both a marketplace/channel and a price.' }

  const comparable = marketComparableSchema.safeParse({
    comparableId: 'manual', channel, evidenceType: input.evidenceType,
    price: Number(price), ...(shipping ? { shipping: Number(shipping) } : {}),
    currency: input.currency.trim().toUpperCase(),
    ...(input.url.trim() ? { url: input.url.trim() } : {}),
  })
  if (!comparable.success) return { status: 'invalid' as const, message: comparable.error.issues[0]?.message ?? 'Check the comparable fields.' }
  return { status: 'valid' as const, comparable: comparable.data }
}
