import type { ListingDetail } from './listing-detail.schemas'

type Observation = ListingDetail['observations'][number]

/** Oldest to newest; missing values are not treated as zero. */
export function listingTrendPoints(observations: Observation[], field: 'price' | 'stockQuantity', limit = 80) {
  return observations.slice(0, limit).reverse().flatMap((observation) => {
    const value = field === 'price' ? Number(observation.price) : observation.stockQuantity
    if (field === 'price' && observation.price === null) return []
    if (value === null || !Number.isFinite(value)) return []
    return [{ value, observedAt: observation.observedAt }]
  })
}

export function trendPolyline(values: number[], width = 300, height = 64) {
  if (values.length < 2) return ''
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const spread = maximum - minimum
  return values.map((value, index) => `${(index / (values.length - 1) * width).toFixed(1)},${(spread === 0 ? height / 2 : height - (value - minimum) / spread * height).toFixed(1)}`).join(' ')
}
