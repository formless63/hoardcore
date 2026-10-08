export function formatChangePrice(price: string | null, currency: string | null) {
  if (price === null) return 'Price not recorded'
  const code = currency || 'USD'
  try { return `${new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(Number(price))} ${code}` }
  catch { return `${Number(price).toFixed(2)} ${code}` }
}

export function movementTone(row: { kinds: string[] }) {
  if (row.kinds.includes('missing')) return 'text-change-removed'
  if (row.kinds.includes('price_drop')) return 'text-change-drop'
  if (row.kinds.includes('price_increase')) return 'text-change-increase'
  return 'text-foreground'
}

export function changeMarkers(kinds: string[]) {
  const markers: Record<string,string> = { new:'✨ New listing',missing:'📤 Removed',reappeared:'🔄 Returned',price_drop:'📉 Price drop',price_increase:'📈 Price increase',price_changed:'💵 Price changed',stock_changed:'📦 Stock changed',currency_changed:'💱 Currency changed' }
  return kinds.filter(kind => kind!=='price_changed' || !kinds.some(value=>value==='price_drop'||value==='price_increase')).map(kind=>markers[kind]??kind).join(' · ')
}

export function priceMovement(row: { beforePresent: boolean | null; afterPresent: boolean | null; beforePrice: string | null; afterPrice: string | null; beforeCurrency: string | null; afterCurrency: string | null; delta: string | null; percent: string | null }) {
  if (row.beforePresent === null) return { label: 'First recorded appearance', detail: 'No earlier price to compare' }
  if (!row.afterPresent) return { label: 'Removed from source', detail: 'Not a price change' }
  if (!row.beforePresent) return { label: 'Returned to source', detail: 'No continuously present baseline' }
  if (row.beforeCurrency !== row.afterCurrency) return { label: 'Currency changed', detail: 'Amounts are not directly comparable' }
  if (row.delta === null) return { label: 'Price not comparable', detail: 'A price was not recorded at one endpoint' }
  const delta = Number(row.delta)
  if (delta === 0) return { label: 'Price unchanged', detail: 'Same earlier and later price' }
  return { label: `${delta < 0 ? '↓ Down' : '↑ Up'} ${formatChangePrice(String(Math.abs(delta)),row.afterCurrency)}`,
    detail: row.percent === null ? 'Percentage unavailable (no positive starting price)' : `${Math.abs(Number(row.percent)).toFixed(2)}% ${delta < 0 ? 'lower' : 'higher'}` }
}
