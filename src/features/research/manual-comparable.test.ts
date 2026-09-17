import { describe, expect, it } from 'vitest'
import { validateManualComparable } from './manual-comparable'

const base = { channel: 'Marketplace', evidenceType: 'completed_sale' as const, price: '45.99', shipping: '', currency: 'USD', url: '' }

describe('manual comparable input', () => {
  it('requires an explicit price rather than converting a blank to zero', () => {
    expect(validateManualComparable({ ...base, price: '' }).status).toBe('invalid')
    expect(validateManualComparable({ ...base, price: '0' }).status).toBe('valid')
  })

  it('accepts a notes-only entry and validates numeric input', () => {
    expect(validateManualComparable({ ...base, channel: '', price: '' }).status).toBe('empty')
    expect(validateManualComparable({ ...base, price: '-1' }).status).toBe('invalid')
    expect(validateManualComparable({ ...base, price: '45.999' }).status).toBe('invalid')
    expect(validateManualComparable({ ...base, shipping: 'oops' }).status).toBe('invalid')
  })
})
