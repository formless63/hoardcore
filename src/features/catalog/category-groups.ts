/**
 * Starter, cross-source groupings for source-supplied product categories.
 * These are review filters, not a replacement for the original category or
 * a claim that every commerce taxonomy can be classified automatically.
 * Unknown and ambiguous labels intentionally remain unmapped.
 */
export const categoryGroups = [
  { id: 'clean-energy', label: 'Solar, EV & Storage', pattern: /\b(solar|ev chargers?|ev stations?|energy storage|inverters?)\b/iu },
  { id: 'circuit-protection', label: 'Circuit Protection', pattern: /\b(fuses?|circuit breakers?|surge protection|afci personnel protection)\b/iu },
  { id: 'distribution', label: 'Load Centers & Distribution', pattern: /\b(load centers?|panelboards?|distribution blocks?|bus bars?|group metering|meters? & accessories|pump panels?)\b/iu },
  { id: 'data-networking', label: 'Data & Networking', pattern: /\b(jacks?|patch panels?|patch cords?|datacom|datacomm|fiber[ -]?optic|fiber distribution|category cable|a\/v cable|coaxial|twinaxial|modular plugs?|multi-media modules?|cross connects?|cameras? - mounts?)\b/iu },
  { id: 'tools-testing', label: 'Tools & Testing', pattern: /\b(tools?|testers?|testing|cutters?|strippers?|crimpers?|pliers?|screwdrivers?|wrenches?|sockets?|bits?|blades?|drills?|saws?|benders?|fish tape|cable pulling|knockout sets?|circuit verifying|voltage & continuity|thermal imagers?|levels? & measuring|hole saws?)\b/iu },
  { id: 'signals-alarms', label: 'Signals & Alarms', pattern: /\b(bells?|chimes?|horns?|signals?|beacons?|stack lights?|indicator lights?|fire protection)\b/iu },
  { id: 'controls-automation', label: 'Controls & Automation', pattern: /\b(contactors?|contact blocks?|starters?|overload relays?|drives?|programmable logic|motor control|motor protectors?|relays?|industrial control|pilot devices?|pushbuttons?|proximity|sensors?|potentiometers?|disconnects?|disconnect switches?|softstarters?|room controllers?|operator interface|time switches?)\b/iu },
  { id: 'lighting', label: 'Lighting', pattern: /\b(light|lighting|led|lamps?|ballasts?|cfl|fluorescent|hid|fixtures?|downlight(?:ing)?|photo controls?|ignitors?|exit signs?|housing and trims?)\b/iu },
  { id: 'wiring-devices', label: 'Wiring Devices', pattern: /\b(wall\s?plates?|wallplates?|decorator style plates?|pin & sleeve|receptacles?|switches?|dimmers?|outlets?|fan controls?|power strips?|wiring device adapters?)\b/iu },
  { id: 'conduit-raceway', label: 'Conduit & Raceway', pattern: /\b(conduit|raceway|wireway|wire duct|cable trays?|liquidtight|strut|hubs?|bushings?|nipples?|unions?|cord grips?|cable glands?|pull boxes?|emt\/imc\/rigid|p[ov]ke-through systems?)\b/iu },
  { id: 'boxes-enclosures', label: 'Boxes & Enclosures', pattern: /\b(box(?:es)?|enclosures?|cabinets?|racks?|frames?)\b/iu },
  { id: 'connectors-terminals', label: 'Connectors & Terminals', pattern: /\b(connectors?|terminals?|lugs?|splices?|taps?|ground blocks?|ground connections?|terminal blocks?|ring tongues?|fork terminals?|compression sleeves?|split bolts?|ground pigtails?)\b/iu },
  { id: 'heating-climate', label: 'Heating & Thermal', pattern: /\b(heaters?|heat cable|thermal management|filters, grills)\b/iu },
  { id: 'wire-cable', label: 'Wire & Cable', pattern: /\b(wire|cable|cordsets?|heat shrink|cold shrink|sealing & insulating tape|thhn|mtw|whips?)\b/iu },
  { id: 'identification', label: 'Labels & Identification', pattern: /\b(labels?|labeling|markers?|marking|signs?)\b/iu },
  { id: 'safety', label: 'Safety & PPE', pattern: /\b(apparel|clothing|gloves?|masks?|headwear|ear protection|hazard|hi-vis|ppe|safety)\b/iu },
  { id: 'hardware', label: 'Fasteners & Hardware', pattern: /\b(anchors?|fasteners?|locknuts?|nuts?|washers?|bolts?|screws?|brackets?|clamps?|straps?|stud wall|threaded rod|carts?|pouches?|belts?|bags?|mounting hardware)\b/iu },
  { id: 'power-equipment', label: 'Power Equipment', pattern: /\b(generators?|transformers?|power supplies?|capacitors?|rectifiers?|rv equipment)\b/iu },
] as const

export const unmappedCategoryGroup = { id: 'unmapped', label: 'Unmapped' } as const
export type CategoryGroupId = (typeof categoryGroups)[number]['id'] | typeof unmappedCategoryGroup.id

export function categoryGroupFor(category: string | null | undefined): CategoryGroupId {
  if (!category?.trim()) return unmappedCategoryGroup.id
  return categoryGroups.find((group) => group.pattern.test(category))?.id ?? unmappedCategoryGroup.id
}

export function categoryGroupLabel(id: CategoryGroupId): string {
  return categoryGroups.find((group) => group.id === id)?.label ?? unmappedCategoryGroup.label
}
