import { describe, expect, it } from 'vitest'
import { listingWorkbenchSearchSchema } from './listing-workbench-state'

describe('listing workbench URL state', () => {
  it('uses safe defaults and preserves valid filter, sort, and pagination state', () => {
    expect(listingWorkbenchSearchSchema.parse({})).toMatchObject({ page: 0, pageSize: 50, sorting: [], filters: { query: '' } })
    expect(listingWorkbenchSearchSchema.parse({ filters: { version: 1, query: 'relay', categoryGroup: '', category: '', manufacturer: '', sourceId: '', stock: 'in', minPrice: null, maxPrice: null, minDiscountAmount: null, maxDiscountAmount: null, minDiscountPercent: null, maxDiscountPercent: null }, sorting: [{ id: 'price', desc: true }], page: 2, pageSize: 100 })).toMatchObject({ page: 2, pageSize: 100, sorting: [{ id: 'price', desc: true }], filters: { query: 'relay', stock: 'in' } })
  })
})
