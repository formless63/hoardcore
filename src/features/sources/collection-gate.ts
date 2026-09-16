export const COLLECTION_DISABLED_MESSAGE = 'Catalog collection is disabled on this deployment'

export function assertCatalogCollectionEnabled(enabled: boolean): void {
  if (!enabled) throw new Error(COLLECTION_DISABLED_MESSAGE)
}
