import type { NormalizedCatalogRecord } from '../types'
import { z } from 'zod'
import { enrichShopifyRecordsWithStock, parseShopifyStockCards, retainShopifyStockEvidenceHtml, type ShopifyStockCard } from './stock-cards'
import { fetchShopifyStockPage, shopifyStockPageUrl, type ShopifyStockEvidencePage } from './stock-transport'
import { ShopifyCollectionTransportError, type ShopifyCollectionRun, type ShopifyHttpClient, type ShopifyTransportEvent } from './transport'

export interface ShopifyStockSupplementResult {
  records: NormalizedCatalogRecord[]
  pages: ShopifyStockEvidencePage[]
  incomplete?: string
}

export const shopifyStockEvidencePagesSchema = z.array(z.object({
  page: z.number().int().positive(), endpoint: z.url(), html: z.string(), capturedAt: z.iso.datetime(),
}))

/** One HTML request per fetched collection page at most; never visits product URLs. */
export async function collectShopifyStockSupplement(input: {
  catalogUrl: string
  records: NormalizedCatalogRecord[]
  pageCount: number
  checkpointPages?: ShopifyStockEvidencePage[]
  http: ShopifyHttpClient
  run: ShopifyCollectionRun
  accessPolicy: (url: string) => Promise<boolean>
  userAgent: string
  minimumDelayMs: number
  sleep?: (milliseconds: number) => Promise<void>
  onEvent?: (event: ShopifyTransportEvent) => Promise<void> | void
  onPage?: (page: ShopifyStockEvidencePage) => Promise<void> | void
}): Promise<ShopifyStockSupplementResult> {
  const pages = [...(input.checkpointPages ?? [])]
  if (pages.length > input.pageCount || pages.some((page, index) => page.page !== index + 1 || page.endpoint !== shopifyStockPageUrl(input.catalogUrl, index + 1))) {
    throw new Error('Stock-card checkpoint does not match this source collection')
  }
  let incomplete: string | undefined
  for (let page = pages.length + 1; page <= input.pageCount; page += 1) {
    if (input.run.requests >= input.run.maxRequests) {
      incomplete = 'Shared request ceiling reached before all stock-card pages could be fetched.'
      break
    }
    let evidence: ShopifyStockEvidencePage
    try {
      evidence = await fetchShopifyStockPage({ ...input, page })
    } catch (error) {
      if (error instanceof ShopifyCollectionTransportError &&
        (error.kind === 'retry_after' || error.kind === 'deferred_backoff' && input.run.requests < input.run.maxRequests)) throw error
      incomplete = error instanceof Error ? error.message : String(error)
      break
    }
    const retainedEvidence = { ...evidence, html: retainShopifyStockEvidenceHtml(evidence.html) }
    pages.push(retainedEvidence)
    await input.onPage?.(retainedEvidence)
  }

  const cards = new Map<string, ShopifyStockCard | null>()
  for (const page of pages) for (const card of parseShopifyStockCards(page.html)) {
    const key = `${card.productId}:${card.variantId}`
    const previous = cards.get(key)
    cards.set(key, previous === undefined || previous?.quantity === card.quantity ? card : null)
  }
  const unambiguous = [...cards.values()].filter((card): card is ShopifyStockCard => card !== null)
  return { records: enrichShopifyRecordsWithStock(input.records, unambiguous, input.catalogUrl), pages, ...(incomplete ? { incomplete } : {}) }
}
