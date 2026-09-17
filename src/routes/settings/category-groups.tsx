import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { categoryGroups, categoryGroupLabel, type CategoryGroupId, unmappedCategoryGroup } from '~/features/catalog/category-groups'
import { deleteCategoryGroupOverride, getCategoryGroupReview, saveCategoryGroupOverride } from '~/features/catalog/category-overrides.functions'

export const Route = createFileRoute('/settings/category-groups')({
  loader: () => getCategoryGroupReview(),
  head: () => ({ meta: [{ title: 'Category mappings · Hoardcore' }] }),
  component: CategoryGroupsSettings,
})

type CategoryRow = {
  sourceId: string
  sourceName: string
  sourceCategory: string
  categoryGroup: string
  overrideGroup: string | null
  listings: number
}

function CategoryGroupSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select aria-label="Internal category group" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded border border-border bg-background px-1.5 text-xs text-foreground">
    {categoryGroups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
    <option value={unmappedCategoryGroup.id}>{unmappedCategoryGroup.label}</option>
  </select>
}

function CategoryGroupsSettings() {
  const review = Route.useLoaderData()
  const router = useRouter()
  const save = useServerFn(saveCategoryGroupOverride)
  const remove = useServerFn(deleteCategoryGroupOverride)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const keyFor = (row: CategoryRow) => `${row.sourceId}:${row.sourceCategory}`

  async function map(row: CategoryRow, categoryGroup: string) {
    setBusyKey(keyFor(row)); setMessage('')
    try {
      await save({ data: { sourceId: row.sourceId, sourceCategory: row.sourceCategory, categoryGroup } })
      await router.invalidate({ sync: true })
      setMessage(`Mapped ${row.sourceCategory} to ${categoryGroupLabel(categoryGroup as CategoryGroupId)}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save category mapping.') }
    finally { setBusyKey(null) }
  }

  async function clear(row: CategoryRow) {
    setBusyKey(keyFor(row)); setMessage('')
    try {
      await remove({ data: { sourceId: row.sourceId, sourceCategory: row.sourceCategory } })
      await router.invalidate({ sync: true })
      setMessage(`Restored the starter grouping for ${row.sourceCategory}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove category mapping.') }
    finally { setBusyKey(null) }
  }

  const renderRow = (row: CategoryRow, actions: 'map' | 'override') => {
    const busy = busyKey === keyFor(row)
    return <tr key={keyFor(row)} className="border-t border-border">
      <td className="px-2 py-2">{row.sourceName}</td><td className="px-2 py-2">{row.sourceCategory}</td><td className="px-2 py-2 text-right tabular-nums">{row.listings.toLocaleString()}</td>
      <td className="px-2 py-2"><CategoryGroupSelect value={row.categoryGroup} onChange={(group) => void map(row, group)} /></td>
      <td className="px-2 py-2">{actions === 'override' ? <Button size="small" variant="secondary" disabled={busy} onClick={() => void clear(row)}>{busy ? 'Working…' : 'Restore default'}</Button> : <span className="text-muted-foreground">Choose a group to save</span>}</td>
    </tr>
  }

  return <main className="w-full px-2 py-3 sm:px-3" id="main-content">
    <div className="mb-3 flex items-center gap-3"><h1 className="text-base font-semibold">Category mappings</h1><Link className="text-xs text-primary underline" to="/settings">Settings</Link></div>
    <p className="mb-3 max-w-3xl text-xs text-muted-foreground">Raw source categories stay unchanged. These installation-wide mappings only control internal category filters and saved-view alerts. Starter groups remain the fallback unless an override is saved.</p>
    {message ? <p className="mb-3 text-xs text-muted-foreground" role="status">{message}</p> : null}
    <section className="border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-2 py-2"><h2 className="text-sm font-semibold">Unmapped review queue</h2><span className="text-xs text-muted-foreground">{review.unmapped.length} categories · {review.unmappedListingCount.toLocaleString()} listings</span></div>
      {review.unmapped.length ? <div className="overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-xs"><thead className="bg-muted text-muted-foreground"><tr><th className="px-2 py-1.5 font-medium">Source</th><th className="px-2 py-1.5 font-medium">Raw category</th><th className="px-2 py-1.5 text-right font-medium">Listings</th><th className="px-2 py-1.5 font-medium">Internal group</th><th className="px-2 py-1.5 font-medium">Status</th></tr></thead><tbody>{review.unmapped.map((row) => renderRow(row, 'map'))}</tbody></table></div> : <p className="px-2 py-4 text-xs text-muted-foreground">Everything with a source category currently resolves to an internal group.</p>}
    </section>
    <section className="mt-4 border border-border bg-card">
      <div className="border-b border-border px-2 py-2"><h2 className="text-sm font-semibold">Saved overrides</h2></div>
      {review.overrides.length ? <div className="overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-xs"><thead className="bg-muted text-muted-foreground"><tr><th className="px-2 py-1.5 font-medium">Source</th><th className="px-2 py-1.5 font-medium">Raw category</th><th className="px-2 py-1.5 text-right font-medium">Listings</th><th className="px-2 py-1.5 font-medium">Internal group</th><th className="px-2 py-1.5 font-medium">Action</th></tr></thead><tbody>{review.overrides.map((row) => renderRow(row, 'override'))}</tbody></table></div> : <p className="px-2 py-4 text-xs text-muted-foreground">No source-specific mappings have been saved.</p>}
    </section>
  </main>
}
