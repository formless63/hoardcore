import { createFileRoute, Link, redirect, useNavigate, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table'
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getChanges } from '~/features/changes/changes.functions'
import { changesQueryOptions } from '~/features/changes/changes.queries'
import { changesSearchSchema, changeKinds, changeLabels, type ChangesSearch } from '~/features/changes/changes.schemas'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/changes')({
  validateSearch: changesSearchSchema,
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(changesQueryOptions(deps)),
  head: () => ({ meta: [{ title: 'Changes · Hoardcore' }] }),
  pendingComponent: () => <main id="main-content" className="p-3" aria-busy="true">Loading catalog changes…</main>,
  errorComponent: ChangesError,
  component: ChangesPage,
})

function ChangesError({ error }: ErrorComponentProps) {
  const router = useRouter()
  return <main id="main-content" className="space-y-3 p-3"><h1 className="font-semibold">Could not load changes</h1><p role="alert">{error instanceof Error ? error.message : 'Please try again.'}</p><Link to="/changes" search={changesSearchSchema.parse({})} className="text-primary underline">Reset comparison</Link><Button onClick={() => void router.invalidate()}>Retry</Button></main>
}

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, Awaited<ReturnType<typeof getChanges>>['rows'][number]>()
function money(price: string | null, currency: string | null, present: boolean | null) { return present ? price === null ? 'Unknown' : `${price} ${currency ?? 'USD'}` : present === null ? 'Not yet observed' : 'Missing' }
const columns = helper.columns([
  helper.accessor('title', { header: 'Listing', cell: info => <div className="max-w-80 whitespace-normal"><Link to="/listings/$listingId" params={{ listingId: info.row.original.listingId }} className="font-medium text-primary hover:underline">{info.getValue()}</Link><p className="mt-1 text-muted-foreground">{info.row.original.sourceName}{info.row.original.sku ? ` · ${info.row.original.sku}` : ''}</p></div> }),
  helper.accessor('kinds', { header: 'Changes', cell: info => <div className="flex max-w-60 flex-wrap gap-1">{info.getValue().filter(kind => kind !== 'price_changed' || !info.getValue().some(value => value === 'price_drop' || value === 'price_increase')).map(kind => <span key={kind} className="rounded border border-border bg-muted px-1.5 py-0.5">{changeLabels[kind as keyof typeof changeLabels] ?? kind}</span>)}</div> }),
  helper.display({ id: 'before', header: 'Before', cell: ({ row: { original: r } }) => <><p>{money(r.beforePrice,r.beforeCurrency,r.beforePresent)}</p>{r.beforePresent ? <p className="text-muted-foreground">{r.beforeAvailable ? 'In stock' : 'Out of stock'} · Qty {r.beforeQuantity ?? '?'}</p> : null}</> }),
  helper.display({ id: 'after', header: 'After', cell: ({ row: { original: r } }) => <><p>{money(r.afterPrice,r.afterCurrency,r.afterPresent)}</p>{r.afterPresent ? <p className="text-muted-foreground">{r.afterAvailable ? 'In stock' : 'Out of stock'} · Qty {r.afterQuantity ?? '?'}</p> : null}</> }),
  helper.display({ id: 'delta', header: 'Price movement', cell: ({ row: { original: r } }) => r.delta === null ? '—' : <><p className={Number(r.delta) < 0 ? 'text-primary' : 'text-foreground'}>{Number(r.delta)>0 ? '+' : ''}{Number(r.delta).toFixed(2)} {r.afterCurrency}</p><p className="text-muted-foreground">{r.percent === null ? 'No percentage baseline' : `${Number(r.percent)>0 ? '+' : ''}${Number(r.percent).toFixed(2)}%`}</p></> }),
  helper.display({ id: 'runs', header: 'Run evidence', cell: ({ row: { original: r } }) => <div className="space-y-1"><time dateTime={new Date(r.at).toISOString()}>{new Date(r.at).toISOString().replace('T',' ').slice(0,19)} UTC</time><p>{r.beforeRunId ? <><Link to="/runs/$runId" params={{ runId: r.beforeRunId }} className="text-primary underline">Before</Link> → </> : null}<Link to="/runs/$runId" params={{ runId: r.afterRunId }} className="text-primary underline">After</Link></p></div> }),
])
const fieldClass = 'mt-1 h-9 w-full min-w-0 rounded border border-border bg-background px-2 text-xs text-foreground'

function localTime(value: string) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16) }
function DateRange({ from, to }: { from: string; to: string }) {
  const [values,setValues] = useState({ from: '', to: '' })
  useEffect(() => setValues({ from: localTime(from), to: localTime(to) }),[from,to])
  return <>{(['from','to'] as const).map(name => <label key={name}>{name === 'from' ? 'From (your local time)' : 'Through (your local time)'}<input name={name} type="datetime-local" value={values[name]} onChange={event => setValues(current => ({ ...current,[name]:event.target.value }))} className={fieldClass} /></label>)}</>
}

function ChangesPage() {
  const search = Route.useSearch()
  const { data, isFetching } = useSuspenseQuery(changesQueryOptions(search))
  const client = useQueryClient()
  const navigate = useNavigate({ from: Route.fullPath })
  const table = useTable({ features, data: data.rows, columns, getRowId: row => `${row.listingId}:${row.afterRunId}` })
  const [formError,setFormError] = useState('')
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError('')
    const form = new FormData(event.currentTarget)
    const value = (key: string) => String(form.get(key) ?? '')
    const input = { ...search, page: 0, sourceId: value('sourceId') || undefined, beforeRunId: value('beforeRunId') || undefined, afterRunId: value('afterRunId') || undefined, query: value('query'), kind: value('kind'), sort: value('sort'),
      from: search.mode === 'recent' && value('from') ? new Date(value('from')).toISOString() : undefined,
      to: search.mode === 'recent' && value('to') ? new Date(value('to')).toISOString() : undefined }
    const parsed = changesSearchSchema.safeParse(input)
    if(!parsed.success) { setFormError(parsed.error.issues.map(issue => issue.message).join('; ')); return }
    void navigate({ search: parsed.data })
  }
  const update = (patch: Partial<ChangesSearch>) => void navigate({ search: current => ({ ...current,...patch,page:0 }) })
  const runLabel = (run: typeof data.runs[number]) => `${new Date(run.at).toISOString().replace('T',' ').slice(0,19)} UTC · ${run.status} · ${run.id.slice(0,8)}`
  return <main id="main-content" className="min-w-0 space-y-3 px-2 py-3 sm:px-3">
    <div className="flex items-center justify-between gap-2"><h1 className="text-base font-semibold">Catalog changes</h1><Button size="small" variant="secondary" disabled={isFetching} onClick={() => void client.invalidateQueries({ queryKey:['changes'] })}>{isFetching ? 'Refreshing…' : 'Refresh'}</Button></div>
    <p className="text-xs text-muted-foreground">Browse every recorded change in a date range, or compare the net state of two runs. Missing means absent from a complete collection—not merely unseen in a partial scan. No source requests are made by this view.</p>
    <div className="flex flex-wrap gap-2" aria-label="Comparison mode"><Button size="small" variant={search.mode==='recent' ? 'primary' : 'secondary'} onClick={() => update({ mode:'recent',beforeRunId:undefined,afterRunId:undefined })}>Date-range feed</Button><Button size="small" variant={search.mode==='runs' ? 'primary' : 'secondary'} onClick={() => update({ mode:'runs',sourceId: data.sourceId ?? data.sources[0]?.id,from:undefined,to:undefined })}>Compare runs</Button></div>
    <form key={JSON.stringify(search)} onSubmit={apply} className="grid gap-3 rounded border border-border bg-card p-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
      <label>Source<select name="sourceId" aria-label="Source" className={fieldClass} value={data.sourceId ?? ''} onChange={event => update({ sourceId:event.target.value || undefined,beforeRunId:undefined,afterRunId:undefined })}>{search.mode==='recent' ? <option value="">All sources</option> : null}{data.sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      {search.mode==='runs' ? <>{(['before','after'] as const).map(which => <label key={which}>{which==='before' ? 'Earlier run' : 'Later run'}<select name={`${which}RunId`} defaultValue={search[`${which}RunId`] ?? ''} className={fieldClass}><option value="">{which==='before' ? 'Previous run' : 'Latest run'}</option>{data.runs.map(run => <option key={run.id} value={run.id}>{runLabel(run)}</option>)}</select></label>)}</> : <DateRange from={data.from} to={data.to} />}
      <label>Change type<select name="kind" aria-label="Change type" defaultValue={search.kind} className={fieldClass}><option value="all">All changes</option>{changeKinds.map(kind => <option key={kind} value={kind}>{changeLabels[kind]}</option>)}</select></label>
      <label>Title or SKU<input name="query" aria-label="Search changes" defaultValue={search.query} maxLength={200} className={fieldClass} placeholder="Search listings…" /></label>
      <label>Sort<select name="sort" defaultValue={search.sort} className={fieldClass}><option value="recent">Most recent</option><option value="drop">Largest price drops (amount)</option><option value="increase">Largest price increases (amount)</option><option value="percent">Largest percentage movement</option></select></label>
      <div className="flex items-end gap-3"><Button type="submit" size="small">Apply filters</Button><Link to="/changes" search={changesSearchSchema.parse({ mode:search.mode,sourceId:search.sourceId })} className="text-primary underline">Reset</Link></div>
      {formError ? <p role="alert" className="text-destructive sm:col-span-2 xl:col-span-4">{formError}</p> : null}
    </form>
    <div className="flex flex-wrap gap-2 text-xs" aria-label="Change counts">{changeKinds.map(kind => <button type="button" key={kind} onClick={() => update({ kind })} aria-pressed={search.kind===kind} className="rounded border border-border bg-card px-2 py-1 aria-pressed:border-primary">{changeLabels[kind]}: {data.counts[kind] ?? 0}</button>)}</div>
    {search.mode==='runs' && data.before && data.after ? <p className="text-xs text-muted-foreground">Comparing {runLabel(data.before)} → {runLabel(data.after)}. Partial runs carry forward unobserved listings; unchanged (304) runs reuse previous state.</p> : null}
    {data.message ? <p role="status" className="rounded border border-border p-3 text-sm">{data.message}</p> : null}
    <p role="status" className="text-xs text-muted-foreground">{data.total.toLocaleString()} matching listing-change records{search.mode==='recent' ? ' (a listing can change in multiple runs)' : ''}. Missing currency is assumed to be USD for display and comparisons; original source evidence is unchanged. Amount sorting compares numeric amounts; currencies are displayed separately.</p>
    <div className="overflow-x-auto rounded border border-border"><table className="w-full min-w-[58rem] text-left text-xs"><thead className="bg-muted"><tr>{table.getHeaderGroups()[0]?.headers.map(header => <th key={header.id} className="px-3 py-2"><table.FlexRender header={header} /></th>)}</tr></thead><tbody className="divide-y divide-border">{table.getRowModel().rows.map(row => <tr key={row.id} className="hover:bg-muted/30">{row.getAllCells().map(cell => <td key={cell.id} className="px-3 py-2 align-top tabular-nums"><table.FlexRender cell={cell} /></td>)}</tr>)}</tbody></table></div>
    {!data.rows.length && !data.message ? <p className="py-4 text-center text-sm text-muted-foreground">No matching changes.{search.mode==='runs' ? ' These runs may have identical prices. Try earlier runs or the date-range feed to include intermediate changes.' : ' Try another date range, source, or change type.'}</p> : null}
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs"><span>Page {data.page+1} of {Math.max(1,Math.ceil(data.total/search.pageSize))}</span><Button size="small" variant="secondary" disabled={data.page===0} onClick={() => void navigate({ search:current=>({...current,page:data.page-1}) })}>Previous</Button><Button size="small" variant="secondary" disabled={(data.page+1)*search.pageSize>=data.total} onClick={() => void navigate({ search:current=>({...current,page:data.page+1}) })}>Next</Button><label>Rows <select aria-label="Changes per page" value={search.pageSize} className="rounded border border-border bg-background p-1" onChange={event=>update({ pageSize:Number(event.target.value) as 50|100|200 })}>{[50,100,200].map(size=><option key={size} value={size}>{size}</option>)}</select></label></div>
  </main>
}
