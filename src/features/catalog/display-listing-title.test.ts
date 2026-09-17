import { describe, expect, it } from 'vitest'
import { displayListingTitle } from './display-listing-title'

describe('displayListingTitle', () => {
  it('hides a distinct trailing SKU already shown in its own column', () => {
    expect(displayListingTitle('Ground Screw - 250-Pk By EPCO GSHT', 'GSHT')).toBe('Ground Screw - 250-Pk By EPCO')
    expect(displayListingTitle('Breaker By Brand lp320-mb', 'LP320-MB')).toBe('Breaker By Brand')
    expect(displayListingTitle('Raceway Bushing 702', '702')).toBe('Raceway Bushing')
  })

  it('preserves titles without an exact standalone trailing SKU', () => {
    expect(displayListingTitle('Model GSHT replacement', 'GSHT')).toBe('Model GSHT replacement')
    expect(displayListingTitle('Circuit 1234', '234')).toBe('Circuit 1234')
    expect(displayListingTitle('GSHT', 'GSHT')).toBe('GSHT')
    expect(displayListingTitle('Original title', null)).toBe('Original title')
  })
})
