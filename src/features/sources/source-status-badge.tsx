import { Badge } from '~/components/ui/badge'
import type { CatalogSourceStatus } from './sources.schemas'

const statuses: Record<
  CatalogSourceStatus,
  { label: string; variant: 'neutral' | 'info' | 'success' | 'danger' }
> = {
  not_collected: { label: 'Not collected', variant: 'neutral' },
  active: { label: 'Active', variant: 'success' },
  paused: { label: 'Paused', variant: 'info' },
  error: { label: 'Needs attention', variant: 'danger' },
}

export function SourceStatusBadge({ status }: { status: CatalogSourceStatus }) {
  const statusDetails = statuses[status]

  return <Badge variant={statusDetails.variant}>{statusDetails.label}</Badge>
}
