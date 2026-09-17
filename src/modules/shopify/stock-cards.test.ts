import { describe, expect, it } from 'vitest'
import { normalizeShopifyCollection, parseShopifyCollection } from './contracts'
import { enrichShopifyRecordsWithStock, parseShopifyStockCards } from './stock-cards'

const catalogUrl = 'https://store.invalid/collections/clearance'
const card = `<div class="inner product-item on-sale" id="product-6547337674833">
  <div class="product-top"><form class="variants" action="/cart/add">
    <input type="hidden" name="id" value="39284681080913">
  </form></div>
  <div class="product-bottom">
    <a class="product-title" href="/collections/clearance/products/sample-plate">Sample wallplate</a>
    <div class="product-inventory"><label>Availability :</label> <span>103 In stock</span></div>
  </div>
</div>`

const records = normalizeShopifyCollection(parseShopifyCollection({ products: [{
  id: '6547337674833', title: 'Sample wallplate', handle: 'sample-plate',
  variants: [
    { id: '39284681080913', price: '0.67', available: true },
    { id: '39284681080914', price: '0.67', available: true },
  ],
}] }), { sourceKey: 'store.invalid/collections/clearance', baseUrl: catalogUrl })

describe('Shopify storefront stock cards', () => {
  it('extracts product, variant, and numeric stock from a collection card', () => {
    expect(parseShopifyStockCards(card)).toEqual([{
      productId: '6547337674833', variantId: '39284681080913', quantity: 103,
    }])
  })

  it('joins by both identities and leaves other variants unknown', () => {
    const enriched = enrichShopifyRecordsWithStock(records, parseShopifyStockCards(card), catalogUrl)
    expect(enriched[0]?.listing.current.stockQuantity).toBe(103)
    expect(enriched[1]?.listing.current.stockQuantity).toBeUndefined()
    expect(records[0]?.listing.current.stockQuantity).toBeUndefined()
  })

  it('rejects unknown, unsafe, and conflicting quantities', () => {
    expect(parseShopifyStockCards(card.replace('103 In stock', 'In stock'))).toEqual([])
    expect(parseShopifyStockCards(card.replace('103 In stock', '10.3 In stock'))).toEqual([])
    expect(parseShopifyStockCards(card.replace('39284681080913', 'other'))).toEqual([])
    expect(parseShopifyStockCards(card.replace('</form>', '<input name="id" value="39284681080914"></form>'))).toEqual([])
    expect(parseShopifyStockCards(card + card.replace('103 In stock', '104 In stock'))).toEqual([])
  })

  it('does not attribute stock from a different product to a known variant', () => {
    const otherCard = card.replace('product-6547337674833', 'product-999')
    const enriched = enrichShopifyRecordsWithStock(records, parseShopifyStockCards(otherCard), catalogUrl)
    expect(enriched[0]?.listing.current.stockQuantity).toBeUndefined()
  })

  it('keeps a quantity already reported by the collection JSON', () => {
    const existing = records.map((record, index) => index === 0 ? {
      ...record,
      listing: { ...record.listing, current: { ...record.listing.current, stockQuantity: 101 } },
    } : record)
    const enriched = enrichShopifyRecordsWithStock(existing, parseShopifyStockCards(card), catalogUrl)
    expect(enriched[0]?.listing.current.stockQuantity).toBe(101)
  })
})
