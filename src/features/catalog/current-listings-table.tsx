import { createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable, type SortingState } from '@tanstack/react-table'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMemo, useRef, useState } from 'react'
import { createResearchExport } from './catalog.functions'
import type { CurrentListing } from './catalog.schemas'
import { emptyListingFilters, listingDiscount, listingFiltersSchema, matchesListingFilters, type ListingFilters } from './listing-filters'
import { deleteListingView, saveListingView } from './saved-views.functions'
import { Input } from '~/components/ui/input'
import { ResearchImportPanel } from '~/features/research/research-import-panel'
import { CachedListingImage, mediaUrl } from '~/features/media/cached-listing-image'
import { WatchButton } from '~/features/watchlist/watch-button'
import type { ResearchSummariesByListing, ResearchComparableSummaryType } from '~/features/research/research.server'
import { displayListingTitle } from './display-listing-title'
import { imagePreviewPosition } from './image-preview-position'
import { categoryGroupFor, categoryGroups, unmappedCategoryGroup } from './category-groups'
import { listingPriceSortValue } from './listing-sort-values'
import { type listingWorkbenchSearchSchema } from './listing-workbench-state'
import type { z } from 'zod'

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() })
const helper = createColumnHelper<typeof features, CurrentListing>()
const pageSizes = [50, 100, 200]

function money(value: string | null, currency: string | null) {
  if (value === null) return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return value
  return currency ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount) : amount.toFixed(2)
}

function ExportPanel({ listingIds, onClear }: { listingIds: string[]; onClear: () => void }) {
  const [exported, setExported] = useState<{ prompt: string; packetJson: string; packet: unknown }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); setError(''); try { setExported(await createResearchExport({ data: { listingIds } })) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed') } finally { setBusy(false) } }
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('Clipboard unavailable; select and copy the text manually.') } }
  const canExport = listingIds.length <= 100
  return <section className="mb-2 flex flex-wrap items-center gap-3 rounded border border-primary/30 bg-card p-2 text-xs" aria-label="Selection toolbar"><span className="font-medium">{listingIds.length} selected</span><button type="button" className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50" onClick={() => void run()} disabled={busy || !canExport}>{busy ? 'Building…' : 'Create research packet'}</button><button type="button" className="text-primary hover:underline" onClick={onClear}>Clear selection</button>{!canExport ? <span className="text-muted-foreground">Research packets support up to 100 listings; narrow your selection.</span> : null}{error ? <p className="w-full text-destructive" role="alert">{error}</p> : null}{exported ? <div className="w-full"><div className="mt-2 grid gap-2 lg:grid-cols-2"><label>Copyable prompt <button type="button" className="text-primary underline" onClick={() => void copy(exported.prompt)}>Copy</button><textarea readOnly value={exported.prompt} className="mt-1 h-40 w-full rounded border border-border bg-muted p-2 font-mono text-xs" /></label><label>ResearchPacket JSON <button type="button" className="text-primary underline" onClick={() => void copy(exported.packetJson)}>Copy</button><textarea readOnly value={exported.packetJson} className="mt-1 h-40 w-full rounded border border-border bg-muted p-2 font-mono text-xs" /></label></div><ResearchImportPanel packet={exported.packet} /></div> : null}</section>
}

function researchValue(summaries: ResearchSummariesByListing, listingId: string, kind: ResearchComparableSummaryType) {
  const entries = summaries[listingId]?.[kind] ?? []
  if (!entries.length) return '—'
  const describe = (entry: typeof entries[number]) => `${entry.channel}: ${entry.medianPrice.toFixed(2)} ${entry.currency} (${entry.count})`
  return <span className="block max-w-40 truncate" title={entries.map(describe).join(' · ')}>{entries.length === 1 ? describe(entries[0]!) : `${describe(entries[0]!)} +${entries.length - 1}`}</span>
}

function makeColumns(selected: Set<string>, toggle: (id: string) => void, showVariants: boolean, showModules: boolean, showMedia: (id: string | null, x?: number, y?: number) => void, moveMedia: (x: number, y: number) => void, filterTo: (key: 'manufacturer' | 'category', value: string) => void, watched: Set<string>, researchSummaries: ResearchSummariesByListing, showResearch: boolean) { return helper.columns([
  helper.display({ id: 'select', header: '', cell: (info) => <input aria-label={`Select ${info.row.original.productTitle}`} type="checkbox" checked={selected.has(info.row.original.id)} onChange={() => toggle(info.row.original.id)} /> }),
  helper.display({ id: 'image', header: '', cell: (info) => <span className="inline-flex size-9 min-w-9 items-center justify-center" tabIndex={info.row.original.mediaCaptureId ? 0 : -1} onPointerEnter={(event) => { if (event.pointerType !== 'touch') showMedia(info.row.original.mediaCaptureId ?? null, event.clientX, event.clientY) }} onPointerMove={(event) => { if (event.pointerType !== 'touch') moveMedia(event.clientX, event.clientY) }} onPointerLeave={() => showMedia(null)} onFocus={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); showMedia(info.row.original.mediaCaptureId ?? null, bounds.right, bounds.top) }} onBlur={() => showMedia(null)}><CachedListingImage captureId={info.row.original.mediaCaptureId} alt="" className="block size-9 min-w-9 rounded border border-border object-contain text-[8px] text-muted-foreground" /></span> }),
  helper.accessor('manufacturer', { header: 'Manufacturer', cell: (info) => info.getValue() ? <button type="button" aria-label={`Filter manufacturer: ${info.getValue()}`} title={`Show only ${info.getValue()}`} className="text-left hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={() => filterTo('manufacturer', info.getValue()!)}>{info.getValue()}</button> : '—' }),
  helper.accessor('productTitle', { header: 'Title', cell: (info) => <Link className="block min-w-48 max-w-xl truncate text-primary hover:underline" title={info.getValue()} to="/listings/$listingId" params={{ listingId: info.row.original.id }}>{displayListingTitle(info.getValue(), info.row.original.sku)}</Link> }),
  helper.accessor('category', { header: 'Category', cell: (info) => info.getValue() ? <button type="button" aria-label={`Filter category: ${info.getValue()}`} title={`Show only ${info.getValue()}`} className="text-left hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring" onClick={() => filterTo('category', info.getValue()!)}>{info.getValue()}</button> : '—' }),
  helper.accessor('sku', { header: 'SKU', cell: (info) => info.getValue() || '—' }),
  helper.accessor((listing) => listingPriceSortValue(listing.price), { id: 'price', header: 'Price', sortUndefined: 'last', cell: (info) => money(info.row.original.price, info.row.original.currency) }),
  helper.accessor((listing) => listingPriceSortValue(listing.compareAtPrice), { id: 'compareAtPrice', header: 'Was', sortUndefined: 'last', cell: (info) => {
    const comparison = info.getValue()
    const price = listingPriceSortValue(info.row.original.price)
    return comparison !== undefined && price !== undefined && comparison > price
      ? <span className="text-muted-foreground line-through">{money(info.row.original.compareAtPrice, info.row.original.currency)}</span>
      : '—'
  } }),
  helper.accessor((listing) => listingDiscount(listing)?.percent ?? -1, { id: 'discount', header: 'Off', cell: (info) => info.getValue() >= 0 ? `${Math.round(info.getValue())}%` : '—' }),
  helper.accessor('available', { header: 'Stock', cell: (info) => <span className={info.getValue() ? 'text-foreground' : 'text-muted-foreground'}>{info.getValue() ? 'In stock' : 'Out'}</span> }),
  helper.accessor((listing) => listing.stockQuantity ?? undefined, { id: 'quantity', header: 'Qty', sortUndefined: 'last', cell: (info) => <span title={info.row.original.stockQuantity === null ? 'Source did not report a numeric quantity' : 'Source-reported quantity'} className="font-mono tabular-nums">{info.row.original.stockQuantity?.toLocaleString() ?? '—'}</span> }),
  ...(showResearch ? [
    helper.display({ id: 'research-asking', header: 'Research asking', cell: (info) => researchValue(researchSummaries, info.row.original.id, 'active_asking') }),
    helper.display({ id: 'research-sold', header: 'Research sold', cell: (info) => researchValue(researchSummaries, info.row.original.id, 'completed_sale') }),
    helper.display({ id: 'research-retail', header: 'Research retail', cell: (info) => researchValue(researchSummaries, info.row.original.id, 'retail_offer') }),
  ] : []),
  helper.accessor('sourceName', { header: 'Source' }),
  helper.display({ id: 'watch', header: 'Watch', cell: (info) => <WatchButton listingId={info.row.original.id} initialWatched={watched.has(info.row.original.id)} /> }),
  helper.accessor('observedAt', { header: 'Observed', cell: (info) => <time dateTime={info.getValue().toISOString()} title={info.getValue().toLocaleString()}>{info.getValue().toISOString().slice(2, 10)}</time> }),
  ...(showVariants ? [helper.accessor('variantTitle', { header: 'Variant', cell: (info) => info.getValue() || '—' })] : []),
  ...(showModules ? [helper.accessor('moduleId', { header: 'Module' })] : []),
  helper.display({ id: 'open', header: '', cell: (info) => <a aria-label={`Open ${info.row.original.productTitle} at source`} className="text-primary hover:underline" href={info.row.original.url} target="_blank" rel="noreferrer">↗</a> }),
]) }

function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-8 max-w-48 rounded border border-border bg-background px-1.5 text-xs text-foreground"><option value="">All {label.toLowerCase()}</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select>
}

type SavedView = { id: string; name: string; filters: ListingFilters }

function NumberFilter({ label, value, onChange, max = 1_000_000_000 }: { label: string; value: number | null; onChange: (value: number | null) => void; max?: number }) {
  return <label className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">{label}<input aria-label={label} type="number" min="0" max={max} step="any" value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} className="h-8 w-20 rounded border border-border bg-background px-1.5 text-xs text-foreground" /></label>
}

type ListingWorkbench = z.output<typeof listingWorkbenchSearchSchema>

export function CurrentListingsTable({ listings, savedViews, watchedListingIds = [], researchSummaries = {}, workbench }: { listings: CurrentListing[]; savedViews: SavedView[]; watchedListingIds?: string[]; researchSummaries?: ResearchSummariesByListing; workbench: ListingWorkbench }) {
  const filters = workbench.filters
  const [selectedViewId, setSelectedViewId] = useState('')
  const [viewName, setViewName] = useState('')
  const [viewBusy, setViewBusy] = useState(false)
  const [viewError, setViewError] = useState('')
  const router = useRouter()
  const saveView = useServerFn(saveListingView)
  const deleteView = useServerFn(deleteListingView)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [hoveredMedia, setHoveredMedia] = useState<{ id: string; left: number; top: number } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate({ from: '/listings/' })
  const watched = useMemo(() => new Set(watchedListingIds), [watchedListingIds])
  const options = useMemo(() => ({ categories: [...new Set(listings.map((item) => item.category).filter((value): value is string => Boolean(value)))].sort(), manufacturers: [...new Set(listings.map((item) => item.manufacturer).filter((value): value is string => Boolean(value)))].sort(), sources: [...new Map(listings.map((item) => [item.sourceId, item.sourceName])).entries()].sort((a, b) => a[1].localeCompare(b[1])) }), [listings])
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const listing of listings) {
      const group = categoryGroupFor(listing.category)
      counts.set(group, (counts.get(group) ?? 0) + 1)
    }
    return counts
  }, [listings])
  const visibleCategories = useMemo(() => filters.categoryGroup
    ? options.categories.filter((category) => categoryGroupFor(category) === filters.categoryGroup)
    : options.categories, [options.categories, filters.categoryGroup])
  const data = useMemo(() => listings.filter((item) => matchesListingFilters(item, filters)), [listings, filters])
  function updateFilter<K extends keyof ListingFilters>(key: K, value: ListingFilters[K]) {
    const nextFilters = {
      ...filters,
      [key]: value,
      ...(key === 'categoryGroup' && value && filters.category && categoryGroupFor(filters.category) !== value ? { category: '' } : {}),
    }
    void navigate({ search: (current) => ({ ...current, filters: nextFilters, page: 0 }) })
    setSelectedViewId('')
  }
  function showMedia(id: string | null, x?: number, y?: number) {
    if (!id || x === undefined || y === undefined) { setHoveredMedia(null); return }
    setHoveredMedia({ id, ...imagePreviewPosition(x, y, window.innerWidth, window.innerHeight) })
  }
  function moveMedia(x: number, y: number) {
    if (!previewRef.current) return
    const position = imagePreviewPosition(x, y, window.innerWidth, window.innerHeight)
    previewRef.current.style.left = `${position.left}px`
    previewRef.current.style.top = `${position.top}px`
  }
  function loadView(id: string) {
    const view = savedViews.find((item) => item.id === id)
    setSelectedViewId(view?.id ?? '')
    setViewName(view?.name ?? '')
    void navigate({ search: (current) => ({ ...current, filters: view?.filters ?? emptyListingFilters, page: 0 }) })
    setViewError('')
  }
  async function saveCurrentView() {
    setViewBusy(true); setViewError('')
    try {
      const result = await saveView({ data: { name: viewName, filters: listingFiltersSchema.parse(filters) } })
      setSelectedViewId(result.id)
      await router.invalidate({ sync: true })
    } catch (error) { setViewError(error instanceof Error ? error.message : 'Could not save view') }
    finally { setViewBusy(false) }
  }
  async function removeCurrentView() {
    if (!selectedViewId) return
    setViewBusy(true); setViewError('')
    try {
      await deleteView({ data: { id: selectedViewId } })
      setSelectedViewId(''); setViewName('')
      await router.invalidate({ sync: true })
    } catch (error) { setViewError(error instanceof Error ? error.message : 'Could not delete view') }
    finally { setViewBusy(false) }
  }
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const showVariants = listings.some((item) => item.variantTitle && item.variantTitle !== 'Default Title')
  const showModules = new Set(listings.map((item) => item.moduleId)).size > 1
  const showResearch = Object.keys(researchSummaries).length > 0
  const table = useTable({ features, data, columns: makeColumns(selected, toggle, showVariants, showModules, showMedia, moveMedia, (key, value) => updateFilter(key, value), watched, researchSummaries, showResearch), getRowId: (listing) => listing.id, state: { sorting: workbench.sorting }, onSortingChange: (next) => { const sorting = typeof next === 'function' ? next(workbench.sorting) : next; void navigate({ search: (current) => ({ ...current, sorting, page: 0 }) }) } })
  const rows = table.getRowModel().rows
  const pageCount = Math.max(1, Math.ceil(rows.length / workbench.pageSize))
  const safePage = Math.min(workbench.page, pageCount - 1)
  return <div>
    {hoveredMedia ? <div ref={previewRef} className="pointer-events-none fixed z-50 flex size-64 max-h-[calc(100vh-16px)] max-w-[calc(100vw-16px)] items-center justify-center rounded border border-border bg-card p-2 shadow-xl" style={{ left: hoveredMedia.left, top: hoveredMedia.top }} role="img" aria-label="Larger captured listing image"><img src={mediaUrl(hoveredMedia.id, 'preview')} alt="" className="max-h-full max-w-full object-contain" /></div> : null}
    {selected.size ? <ExportPanel listingIds={[...selected]} onClear={() => setSelected(new Set())} /> : null}
    <div className="mb-1 flex flex-wrap items-center gap-1.5"><div className="w-full shrink-0 sm:w-72 lg:w-80"><Input aria-label="Search current listings" className="h-8 text-xs" placeholder="Search title, SKU, tag…" value={filters.query} onChange={(event) => updateFilter('query', event.target.value)} /></div><select aria-label="Category groups" value={filters.categoryGroup} onChange={(event) => updateFilter('categoryGroup', event.target.value)} className="h-8 max-w-56 rounded border border-border bg-background px-1.5 text-xs text-foreground"><option value="">All groups</option>{categoryGroups.map((group) => <option key={group.id} value={group.id}>{group.label} ({groupCounts.get(group.id) ?? 0})</option>)}<option value={unmappedCategoryGroup.id}>{unmappedCategoryGroup.label} ({groupCounts.get(unmappedCategoryGroup.id) ?? 0})</option></select><FilterSelect label="Categories" value={filters.category} values={visibleCategories} onChange={(value) => updateFilter('category', value)} /><FilterSelect label="Manufacturers" value={filters.manufacturer} values={options.manufacturers} onChange={(value) => updateFilter('manufacturer', value)} /><select aria-label="Sources" value={filters.sourceId} onChange={(event) => updateFilter('sourceId', event.target.value)} className="h-8 max-w-48 rounded border border-border bg-background px-1.5 text-xs text-foreground"><option value="">All sources</option>{options.sources.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><select aria-label="Stock" value={filters.stock} onChange={(event) => updateFilter('stock', event.target.value as ListingFilters['stock'])} className="h-8 rounded border border-border bg-background px-1.5 text-xs text-foreground"><option value="all">All stock</option><option value="in">In stock</option><option value="out">Out</option></select><span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{rows.length.toLocaleString()} listings</span></div>
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">{Object.entries({ Search: filters.query, Group: filters.categoryGroup, Category: filters.category, Maker: filters.manufacturer, Stock: filters.stock === 'all' ? '' : filters.stock }).filter(([, value]) => value).map(([label, value]) => <span key={label} className="rounded-full border border-border bg-muted px-2 py-0.5">{label}: {value}</span>)}{Object.values(filters).some((value) => value !== '' && value !== null && value !== 'all' && value !== 1) ? <button type="button" onClick={() => loadView('')} className="text-primary hover:underline">Clear filters</button> : null}<details className="ml-auto"><summary className="cursor-pointer rounded border border-border px-2 py-1">Saved views</summary><div className="absolute z-20 mt-1 flex flex-wrap gap-1 rounded border border-border bg-card p-2 shadow"><select aria-label="Saved views" value={selectedViewId} onChange={(event) => loadView(event.target.value)} className="h-8 max-w-48 rounded border border-border bg-background px-1.5"><option value="">Current filters</option>{savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</select><Input aria-label="View name" className="h-8 w-32 text-xs" maxLength={80} placeholder="View name" value={viewName} onChange={(event) => setViewName(event.target.value)} /><button type="button" disabled={viewBusy || !viewName.trim()} onClick={() => void saveCurrentView()} className="h-8 rounded bg-primary px-2 text-primary-foreground disabled:opacity-50">Save</button>{selectedViewId ? <button type="button" disabled={viewBusy} onClick={() => void removeCurrentView()} className="h-8 rounded border border-border px-2 text-destructive">Delete</button> : null}{viewError ? <span role="alert" className="text-destructive">{viewError}</span> : null}</div></details><details className="w-full"><summary className="cursor-pointer text-muted-foreground">Advanced price and discount filters</summary><div className="mt-1 flex flex-wrap gap-x-2 gap-y-1"><NumberFilter label="Price min" value={filters.minPrice} onChange={(value) => updateFilter('minPrice', value)} /><NumberFilter label="Price max" value={filters.maxPrice} onChange={(value) => updateFilter('maxPrice', value)} /><NumberFilter label="Off min" value={filters.minDiscountAmount} onChange={(value) => updateFilter('minDiscountAmount', value)} /><NumberFilter label="Off max" value={filters.maxDiscountAmount} onChange={(value) => updateFilter('maxDiscountAmount', value)} /><NumberFilter label="Off % min" value={filters.minDiscountPercent} max={100} onChange={(value) => updateFilter('minDiscountPercent', value)} /><NumberFilter label="Off % max" value={filters.maxDiscountPercent} max={100} onChange={(value) => updateFilter('maxDiscountPercent', value)} /></div></details></div>
    <div className="overflow-x-auto border border-border"><table className="w-max min-w-full text-left text-xs font-normal"><thead className="bg-muted/50 text-muted-foreground"><tr>{table.getHeaderGroups()[0]?.headers.map((header) => <th className={`whitespace-nowrap px-1.5 py-1.5 font-medium ${header.column.id === 'image' ? 'w-12 min-w-12' : ''}`} key={header.id}><button className="hover:text-foreground" type="button" onClick={header.column.getToggleSortingHandler()}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}{({ asc: ' ↑', desc: ' ↓' } as Record<string, string>)[header.column.getIsSorted() as string] ?? ''}</button></th>)}</tr></thead><tbody className="divide-y divide-border">{rows.slice(safePage * workbench.pageSize, (safePage + 1) * workbench.pageSize).map((row) => <tr className="hover:bg-muted/30" key={row.id}>{row.getAllCells().map((cell) => <td className={`whitespace-nowrap px-1.5 py-1 font-normal ${cell.column.id === 'image' ? 'w-12 min-w-12' : ''}`} key={cell.id}><table.FlexRender cell={cell} /></td>)}</tr>)}</tbody></table></div>
    {rows.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No listings match these filters.</p> : <div className="mt-2 flex items-center justify-end gap-2 text-xs"><span className="text-muted-foreground">{safePage * workbench.pageSize + 1}–{Math.min((safePage + 1) * workbench.pageSize, rows.length)} of {rows.length}</span><button disabled={safePage === 0} onClick={() => void navigate({ search: (current) => ({ ...current, page: safePage - 1 }) })} className="rounded border border-border px-2 py-1 disabled:opacity-40">Previous</button><button disabled={safePage >= pageCount - 1} onClick={() => void navigate({ search: (current) => ({ ...current, page: safePage + 1 }) })} className="rounded border border-border px-2 py-1 disabled:opacity-40">Next</button><select aria-label="Rows per page" value={workbench.pageSize} onChange={(event) => void navigate({ search: (current) => ({ ...current, pageSize: Number(event.target.value) as 50 | 100 | 200, page: 0 }) })} className="rounded border border-border bg-background px-1 py-1">{pageSizes.map((size) => <option key={size} value={size}>{size}/page</option>)}</select></div>}
  </div>
}
