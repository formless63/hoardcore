import { describe, expect, it } from 'vitest'
import { categoryGroupFor, categoryGroups, unmappedCategoryGroup } from './category-groups'

describe('starter category groups', () => {
  it.each([
    ['LED Downlighting', 'lighting'],
    ['Load Centers - Copper Bus', 'distribution'],
    ['Panelboards & Accessories', 'distribution'],
    ['Pliers', 'tools-testing'],
    ['Cable & Bolt - Cutters / Benders', 'tools-testing'],
    ['Circuit Breakers - Plug-On', 'circuit-protection'],
    ['Power Fuses', 'circuit-protection'],
    ['Jacks - Snap-In', 'data-networking'],
    ['Patch Panels - Copper', 'data-networking'],
    ['Wallplates', 'wiring-devices'],
    ['Conduit Bodies - Aluminum', 'conduit-raceway'],
    ['Solar Cables & Cable Management', 'clean-energy'],
    ['LED Stack Lights', 'signals-alarms'],
    ['NEMA & IEC Contactors', 'controls-automation'],
    ['Floor Box - Accessories', 'boxes-enclosures'],
    ['Decorator Style Plates', 'wiring-devices'],
    ['Manual Motor Protectors', 'controls-automation'],
    ['Wire Connectors - Push-In Type', 'connectors-terminals'],
    ['Electrical Labels', 'identification'],
  ] as const)('maps %s to %s', (category, group) => {
    expect(categoryGroupFor(category)).toBe(group)
  })

  it('keeps ambiguous or missing source labels unmapped', () => {
    for (const category of ['Steel', 'Zinc Die Cast', 'Warehouse Items', '', null]) {
      expect(categoryGroupFor(category)).toBe(unmappedCategoryGroup.id)
    }
  })

  it('has stable unique identifiers suitable for saved filters', () => {
    const ids = categoryGroups.map((group) => group.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain(unmappedCategoryGroup.id)
  })
})
