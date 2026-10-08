import { queryOptions } from '@tanstack/react-query'
import { getChanges } from './changes.functions'
import type { ChangesSearch } from './changes.schemas'

export function changesQueryOptions(search: ChangesSearch) {
  return queryOptions({ queryKey: ['changes', search], queryFn: () => getChanges({ data: search }), staleTime: 30_000 })
}
