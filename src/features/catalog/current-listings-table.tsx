import { createColumnHelper, createSortedRowModel, rowSortingFeature, tableFeatures, useTable, type SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { CurrentListing } from './catalog.schemas'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import { Link } from '@tanstack/react-router'
import { createResearchExport } from './catalog.functions'

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() })
const helper = createColumnHelper<typeof features, CurrentListing>()
function ExportPanel({ listingIds }: { listingIds: string[] }) {
  const [exported, setExported] = useState<{ prompt: string; packetJson: string }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); setError(''); try { setExported(await createResearchExport({ data: { listingIds } })) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed') } finally { setBusy(false) } }
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('Clipboard unavailable; select and copy the text manually.') } }
  return <section className="mt-5 rounded-lg border border-border bg-card p-5" aria-label="Research packet export"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-foreground">Research packet</h2><p className="text-sm text-muted-foreground">{listingIds.length} listing(s) selected; facts are re-read from the database.</p></div><button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => void run()} disabled={busy}>{busy ? 'Building…' : 'Create research packet'}</button></div>{error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}{exported ? <div className="mt-5 space-y-5"><label className="block text-sm font-medium text-foreground">Copyable prompt<button type="button" className="ml-3 text-primary underline" onClick={() => void copy(exported.prompt)}>Copy</button><textarea readOnly value={exported.prompt} className="mt-2 min-h-48 w-full rounded border border-border bg-muted p-3 font-mono text-xs" /></label><label className="block text-sm font-medium text-foreground">ResearchPacket JSON<button type="button" className="ml-3 text-primary underline" onClick={() => void copy(exported.packetJson)}>Copy</button><textarea readOnly value={exported.packetJson} className="mt-2 min-h-48 w-full rounded border border-border bg-muted p-3 font-mono text-xs" /></label></div> : null}</section>
}

function makeColumns(selected: Set<string>, toggle: (id: string) => void) { return helper.columns([
  helper.display({ id: 'select', header: 'Select', cell: (info) => <input aria-label={`Select ${info.row.original.productTitle}`} type="checkbox" checked={selected.has(info.row.original.id)} onChange={() => toggle(info.row.original.id)} /> }),
  helper.accessor('productTitle', { header: 'Product', cell: (info) => <span className="font-medium">{info.getValue()}</span> }),
  helper.accessor('variantTitle', { header: 'Variant', cell: (info) => info.getValue() ?? '—' }),
  helper.accessor('sourceName', { header: 'Source' }),
  helper.accessor('moduleId', { header: 'Module' }),
  helper.accessor('sku', { header: 'SKU', cell: (info) => info.getValue() ?? '—' }),
  helper.accessor('price', { header: 'Price', cell: (info) => info.row.original.price ? `${info.row.original.currency ?? ''} ${info.getValue()}`.trim() : '—' }),
  helper.accessor('available', { header: 'Availability', cell: (info) => <Badge variant={info.getValue() ? 'success' : 'neutral'}>{info.getValue() ? 'Available' : 'Unavailable'}</Badge> }),
  helper.accessor('observedAt', { header: 'Observed', cell: (info) => info.getValue().toLocaleString() }),
  helper.display({ id: 'details', header: '', cell: (info) => <span className="flex gap-3"><Link className="text-primary underline" to="/listings/$listingId" params={{ listingId: info.row.original.id }}>Details</Link><a className="text-primary underline" href={info.row.original.url} target="_blank" rel="noreferrer">Open</a></span> }),
]) }

export function CurrentListingsTable({ listings }: { listings: CurrentListing[] }) {
  const [filter, setFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const data = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return listings
    return listings.filter((listing) => [listing.productTitle, listing.variantTitle, listing.sourceName, listing.moduleId, listing.sku].some((value) => value?.toLowerCase().includes(needle)))
  }, [filter, listings])
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const table = useTable({ features, data, columns: makeColumns(selected, toggle), state: { sorting }, onSortingChange: setSorting })
  return <div>
    {selected.size ? <ExportPanel listingIds={[...selected]} /> : null}
    <Input aria-label="Search current listings" className="mb-4 max-w-md" placeholder="Search products, sources, SKUs…" value={filter} onChange={(event) => setFilter(event.target.value)} />
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{table.getHeaderGroups()[0]?.headers.map((header) => <th className="whitespace-nowrap px-4 py-3 font-medium" key={header.id}><button className="hover:text-foreground" type="button" onClick={header.column.getToggleSortingHandler()}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}{({ asc: ' ↑', desc: ' ↓' } as Record<string, string>)[header.column.getIsSorted() as string] ?? ''}</button></th>)}</tr></thead><tbody className="divide-y divide-border">{table.getRowModel().rows.map((row) => <tr className="hover:bg-muted/30" key={row.id}>{row.getAllCells().map((cell) => <td className="whitespace-nowrap px-4 py-3" key={cell.id}><table.FlexRender cell={cell} /></td>)}</tr>)}</tbody></table>
    </div>
    {table.getRowModel().rows.length === 0 ? <p className="py-8 text-center text-muted-foreground">No listings match your search.</p> : null}
  </div>
}
