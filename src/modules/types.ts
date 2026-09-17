import type { z } from 'zod'

export type ModuleStatus = 'planned' | 'experimental' | 'stable'

export type SourceConfig = Record<string, unknown>

/** Stable, source-independent catalog concepts produced by source modules. */
export interface NormalizedProduct {
  productKey: string
  title: string
  description?: string
  brand?: string
  productType?: string
  tags: string[]
  imageUrls?: string[]
}

export interface NormalizedVariant {
  variantKey: string
  productKey: string
  title?: string
  sku?: string
  barcode?: string
  price?: number
  compareAtPrice?: number
  /** Operator-declared source currency; absent means unknown, never an inferred USD. */
  currency?: string
  available: boolean
  imageUrl?: string
}

export interface NormalizedSourceListing {
  listingKey: string
  sourceKey: string
  productKey: string
  variantKey: string
  url: string
  imageUrl?: string
  current: {
    title: string
    price?: number
    compareAtPrice?: number
    /** Operator-declared source currency; absent means unknown. */
    currency?: string
    available: boolean
    /** Source-reported count, when supplied; absence is not zero. */
    stockQuantity?: number
  }
  observedAt?: string
}

export interface NormalizedCatalogRecord {
  product: NormalizedProduct
  variant: NormalizedVariant
  listing: NormalizedSourceListing
}

export interface HoardcoreModuleManifest {
  id: string
  name: string
  description: string
  status: ModuleStatus
}

export interface NormalizedSourceConfig {
  config: SourceConfig
  sourceKey: string
  summary: string
}

export interface SourceRegistrationCapability<TInputSchema extends z.ZodType = z.ZodType> {
  inputSchema: TInputSchema
  normalize: (input: unknown) => NormalizedSourceConfig
  read: (config: unknown) => NormalizedSourceConfig
}

export interface HoardcoreSourceModule<TInputSchema extends z.ZodType = z.ZodType> {
  manifest: HoardcoreModuleManifest
  sourceRegistration: SourceRegistrationCapability<TInputSchema>
}
