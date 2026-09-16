import { describe, expect, it } from 'vitest'
import { assertCatalogCollectionEnabled } from './collection-gate'

describe('catalog collection host gate', () => {
  it('rejects a disabled host before source traffic can be queued', () => {
    expect(() => assertCatalogCollectionEnabled(false)).toThrow('Catalog collection is disabled on this deployment')
    expect(() => assertCatalogCollectionEnabled(true)).not.toThrow()
  })
})
