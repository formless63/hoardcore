import { load } from 'cheerio'
import type { NormalizedCatalogRecord } from '../types'

export interface ShopifyStockCard {
  productId: string
  variantId: string
  quantity: number
}

/**
 * Read numeric inventory only when the card exposes both Shopify identities.
 * Product-card position, title, and SKU are not safe join keys.
 */
export function parseShopifyStockCards(html: string): ShopifyStockCard[] {
  const $ = load(html)
  const cards = new Map<string, ShopifyStockCard | null>()

  $('.product-item[id^="product-"]').each((_, element) => {
    const card = $(element)
    const productId = /^product-(\d+)$/u.exec(card.attr('id') ?? '')?.[1]
    const variantIds = [...new Set(card.find('form.variants input[name="id"]')
      .map((_, input) => $(input).attr('value')).get())]
    const variantId = variantIds.length === 1 ? variantIds[0] : undefined
    const stockText = card.find('.product-bottom .product-inventory span').first().text()
    const quantityText = /^(\d[\d,]*)\s+in stock$/iu.exec(stockText.trim())?.[1]
    if (!productId || !variantId || !/^\d+$/u.test(variantId) || !quantityText) return

    const quantity = Number(quantityText.replaceAll(',', ''))
    if (!Number.isSafeInteger(quantity)) return

    const key = `${productId}:${variantId}`
    const previous = cards.get(key)
    // Conflicting cards are ambiguous, so discard that value entirely.
    cards.set(key, previous === undefined || previous?.quantity === quantity
      ? { productId, variantId, quantity }
      : null)
  })

  return [...cards.values()].filter((card): card is ShopifyStockCard => card !== null)
}

/** Only updates records whose product and variant IDs both match a parsed card. */
export function enrichShopifyRecordsWithStock(
  records: NormalizedCatalogRecord[],
  cards: ShopifyStockCard[],
  catalogUrl: string,
): NormalizedCatalogRecord[] {
  const storefrontKey = new URL(catalogUrl).host.toLowerCase()
  const quantities = new Map(cards.map((card) => [
    `shopify:${storefrontKey}:product:${card.productId}:variant:${card.variantId}`,
    card.quantity,
  ]))

  return records.map((record) => {
    const quantity = quantities.get(record.variant.variantKey)
    if (quantity === undefined || record.listing.current.stockQuantity !== undefined || record.product.productKey !== record.variant.productKey) return record
    return {
      ...record,
      listing: {
        ...record.listing,
        current: { ...record.listing.current, stockQuantity: quantity },
      },
    }
  })
}
