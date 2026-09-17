import { describe, expect, it } from 'vitest'
import { stockLabel } from './stock-label'

describe('stockLabel', () => {
  it('does not mistake unknown quantity for zero', () => {
    expect(stockLabel(true, null)).toBe('In stock')
    expect(stockLabel(false, null)).toBe('Out')
  })

  it('shows source-reported counts while retaining availability', () => {
    expect(stockLabel(true, 245)).toBe('245 in stock')
    expect(stockLabel(true, 0)).toBe('0 reported · in stock')
    expect(stockLabel(false, 7)).toBe('7 reported · out')
  })
})
