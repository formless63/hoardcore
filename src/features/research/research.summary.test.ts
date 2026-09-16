import { describe, expect, it } from 'vitest'
import { summarizeComparableRows } from './research.server'

describe('research comparable summaries', () => {
  it('calculates deterministic medians without mixing currencies or evidence types', () => {
    expect(summarizeComparableRows([
      { listingId: 'listing-a', evidenceType: 'completed_sale', channel: 'Market A', currency: 'USD', price: '10.00' },
      { listingId: 'listing-a', evidenceType: 'completed_sale', channel: 'Market A', currency: 'USD', price: '30.00' },
      { listingId: 'listing-a', evidenceType: 'completed_sale', channel: 'Market A', currency: 'EUR', price: '20.00' },
      { listingId: 'listing-a', evidenceType: 'completed_sale', channel: 'Market B', currency: 'USD', price: '90.00' },
      { listingId: 'listing-a', evidenceType: 'active_asking', channel: 'Market A', currency: 'USD', price: '50.00' },
      { listingId: null, evidenceType: 'retail_offer', channel: 'Retail', currency: 'USD', price: '99.00' },
    ])).toEqual({
      'listing-a': {
        completed_sale: [{ channel: 'Market A', currency: 'EUR', count: 1, medianPrice: 20 }, { channel: 'Market A', currency: 'USD', count: 2, medianPrice: 20 }, { channel: 'Market B', currency: 'USD', count: 1, medianPrice: 90 }],
        active_asking: [{ channel: 'Market A', currency: 'USD', count: 1, medianPrice: 50 }],
      },
    })
  })
})
