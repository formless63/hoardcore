/**
 * Keep unknown prices distinct from zero. The table's undefined sorting policy
 * then puts source records without a reported price after numeric values.
 */
export function listingPriceSortValue(value: string | null): number | undefined {
  if (value === null) return undefined

  const amount = Number(value)
  return Number.isFinite(amount) ? amount : undefined
}
