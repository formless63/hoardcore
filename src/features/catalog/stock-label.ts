/** Preserve the difference between a known count and availability alone. */
export function stockLabel(available: boolean, stockQuantity: number | null): string {
  if (stockQuantity === null) return available ? 'In stock' : 'Out'
  if (!available) return `${stockQuantity} reported · out`
  if (stockQuantity <= 0) return `${stockQuantity} reported · in stock`
  return `${stockQuantity} in stock`
}
