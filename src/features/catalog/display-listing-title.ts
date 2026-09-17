/** Hide a duplicated trailing SKU in the table without changing source data. */
export function displayListingTitle(title: string, sku: string | null): string {
  const trimmedTitle = title.trimEnd()
  const trimmedSku = sku?.trim()
  if (!trimmedSku || trimmedTitle.length <= trimmedSku.length) return title
  if (trimmedTitle.slice(-trimmedSku.length).toLowerCase() !== trimmedSku.toLowerCase()) return title
  const prefix = trimmedTitle.slice(0, -trimmedSku.length)
  return /\s$/.test(prefix) ? prefix.trimEnd() : title
}
