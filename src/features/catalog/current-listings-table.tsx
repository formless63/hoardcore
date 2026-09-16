import { createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable, type SortingState } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { createResearchExport } from './catalog.functions'
import type { CurrentListing } from './catalog.schemas'
import { Input } from '~/components/ui/input'

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() })
const helper = createColumnHelper<typeof features, CurrentListing>()
const pageSizes = [50, 100, 200]

function money(value: string | null, currency: string | null) {
  if (value === null) return '—'
  const amount = Number(value)
  return Number.isFinite(amount) ? new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount) : value
}

function ExportPanel({ listingIds }: { listingIds: string[] }) {
  const [exported, setExported] = useState<{ prompt: string; packetJson: string }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); setError(''); try { setExported(await createResearchExport({ data: { listingIds } })) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed') } finally { setBusy(false) } }
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('Clipboard unavailable; select and copy the text manually.') } }
  return <section className="mb-2 rounded border border-border bg-card p-2 text-xs" aria-label="Research packet export"><div className="flex flex-wrap items-center gap-3"><span>{listingIds.length} selected</span><button type="button" className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50" onClick={() => void run()} disabled={busy}>{busy ? 'Building…' : 'Create research packet'}</button></div>{error ? <p className="mt-2 text-destructive" role="alert">{error}</p> : null}{exported ? <div className="mt-2 grid gap-2 lg:grid-cols-2"><label>Copyable prompt <button type="button" className="text-primary underline" onClick={() => void copy(exported.prompt)}>Copy</button><textarea readOnly value={exported.prompt} className="mt-1 h-40 w-full rounded border border-border bg-muted p-2 font-mono text-xs" /></label><label>ResearchPacket JSON <button type="button" className="text-primary underline" onClick={() => void copy(exported.packetJson)}>Copy</button><textarea readOnly value={exported.packetJson} className="mt-1 h-40 w-full rounded border border-border bg-muted p-2 font-mono text-xs" /></label></div> : null}</section>
}

function makeColumns(selected: Set<string>, toggle: (id: string) => void, showVariants: boolean, showModules: boolean) { return helper.columns([
  helper.display({ id: 'select', header: '', cell: (info) => <input aria-label={`Select ${info.row.original.productTitle}`} type="checkbox" checked={selected.has(info.row.original.id)} onChange={() => toggle(info.row.original.id)} /> }),
  helper.display({ id: 'image', header: '', cell: (info) => info.row.original.imageUrl ? <img src={info.row.original.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-9 rounded border border-border object-contain" /> : null }),
  helper.accessor('manufacturer', { header: 'Manufacturer', cell: (info) => info.getValue() || '—' }),
  helper.accessor('productTitle', { header: 'Title', cell: (info) => <Link className="block min-w-48 max-w-xl truncate text-primary hover:underline" title={info.getValue()} to="/listings/$listingId" params={{ listingId: info.row.original.id }}>{info.getValue()}</Link> }),
  helper.accessor('category', { header: 'Category', cell: (info) => info.getValue() || '—' }),
  helper.accessor('sku', { header: 'SKU', cell: (info) => info.getValue() || '—' }),
  helper.accessor((listing) => Number(listing.price ?? 0), { id: 'price', header: 'Price', cell: (info) => money(info.row.original.price, info.row.original.currency) }),
  helper.accessor('compareAtPrice', { header: 'Was', cell: (info) => info.getValue() && Number(info.getValue()) > Number(info.row.original.price ?? 0) ? <span className="text-muted-foreground line-through">{money(info.getValue(), info.row.original.currency)}</span> : '—' }),
  helper.accessor('available', { header: 'Stock', cell: (info) => <span title="Source reports availability, not a quantity" className={info.getValue() ? 'text-foreground' : 'text-muted-foreground'}>{info.getValue() ? 'In stock' : 'Out'}</span> }),
  helper.accessor('sourceName', { header: 'Source' }),
  helper.accessor('observedAt', { header: 'Observed', cell: (info) => <time dateTime={info.getValue().toISOString()} title={info.getValue().toLocaleString()}>{info.getValue().toISOString().slice(2, 10)}</time> }),
  ...(showVariants ? [helper.accessor('variantTitle', { header: 'Variant', cell: (info) => info.getValue() || '—' })] : []),
  ...(showModules ? [helper.accessor('moduleId', { header: 'Module' })] : []),
  helper.display({ id: 'open', header: '', cell: (info) => <a aria-label={`Open ${info.row.original.productTitle} at source`} className="text-primary hover:underline" href={info.row.original.url} target="_blank" rel="noreferrer">↗</a> }),
]) }

function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="h-8 max-w-48 rounded border border-border bg-background px-1.5 text-xs text-foreground"><option value="">All {label.toLowerCase()}</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select>
}

export function CurrentListingsTable({ listings }: { listings: CurrentListing[] }) {
  const [filter, setFilter] = useState('')
  const [category, setCategory] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [source, setSource] = useState('')
  const [stock, setStock] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const options = useMemo(() => ({ categories: [...new Set(listings.map((item) => item.category).filter((value): value is string => Boolean(value)))].sort(), manufacturers: [...new Set(listings.map((item) => item.manufacturer).filter((value): value is string => Boolean(value)))].sort(), sources: [...new Set(listings.map((item) => item.sourceName))].sort() }), [listings])
  const data = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return listings.filter((item) => (!needle || [item.productTitle, item.variantTitle, item.manufacturer, item.category, item.sourceName, item.moduleId, item.sku].some((value) => value?.toLowerCase().includes(needle))) && (!category || item.category === category) && (!manufacturer || item.manufacturer === manufacturer) && (!source || item.sourceName === source) && (!stock || item.available === (stock === 'in')))
  }, [listings, filter, category, manufacturer, source, stock])
  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(0) }
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const showVariants = listings.some((item) => item.variantTitle && item.variantTitle !== 'Default Title')
  const showModules = new Set(listings.map((item) => item.moduleId)).size > 1
  const table = useTable({ features, data, columns: makeColumns(selected, toggle, showVariants, showModules), state: { sorting }, onSortingChange: setSorting })
  const rows = table.getRowModel().rows
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  return <div>
    {selected.size ? <ExportPanel listingIds={[...selected]} /> : null}
    <div className="mb-2 flex flex-wrap items-center gap-1.5"><Input aria-label="Search current listings" className="h-8 min-w-52 flex-1 text-xs sm:max-w-sm" placeholder="Search title, SKU, manufacturer…" value={filter} onChange={(event) => changeFilter(setFilter)(event.target.value)} /><FilterSelect label="Categories" value={category} values={options.categories} onChange={changeFilter(setCategory)} /><FilterSelect label="Manufacturers" value={manufacturer} values={options.manufacturers} onChange={changeFilter(setManufacturer)} /><FilterSelect label="Sources" value={source} values={options.sources} onChange={changeFilter(setSource)} /><select aria-label="Stock" value={stock} onChange={(event) => changeFilter(setStock)(event.target.value)} className="h-8 rounded border border-border bg-background px-1.5 text-xs text-foreground"><option value="">All stock</option><option value="in">In stock</option><option value="out">Out</option></select><span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{rows.length.toLocaleString()} listings</span></div>
    <div className="overflow-x-auto border border-border"><table className="w-full text-left text-xs font-normal"><thead className="bg-muted/50 text-muted-foreground"><tr>{table.getHeaderGroups()[0]?.headers.map((header) => <th className="whitespace-nowrap px-1.5 py-1.5 font-medium" key={header.id}><button className="hover:text-foreground" type="button" onClick={header.column.getToggleSortingHandler()}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}{({ asc: ' ↑', desc: ' ↓' } as Record<string, string>)[header.column.getIsSorted() as string] ?? ''}</button></th>)}</tr></thead><tbody className="divide-y divide-border">{rows.slice(safePage * pageSize, (safePage + 1) * pageSize).map((row) => <tr className="hover:bg-muted/30" key={row.id}>{row.getAllCells().map((cell) => <td className="whitespace-nowrap px-1.5 py-1 font-normal" key={cell.id}><table.FlexRender cell={cell} /></td>)}</tr>)}</tbody></table></div>
    {rows.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No listings match these filters.</p> : <div className="mt-2 flex items-center justify-end gap-2 text-xs"><span className="text-muted-foreground">{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, rows.length)} of {rows.length}</span><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded border border-border px-2 py-1 disabled:opacity-40">Previous</button><button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="rounded border border-border px-2 py-1 disabled:opacity-40">Next</button><select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0) }} className="rounded border border-border bg-background px-1 py-1">{pageSizes.map((size) => <option key={size} value={size}>{size}/page</option>)}</select></div>}
  </div>
}
