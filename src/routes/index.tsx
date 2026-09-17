import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getOverview } from '~/features/overview/overview.functions'
import { SourceLoadError } from '~/features/sources/source-load-state'
import { z } from 'zod'

export const Route = createFileRoute('/')({
  beforeLoad: async () => { if (!(await getPublicSession())) throw redirect({ to: '/login' }) },
  validateSearch: z.object({ days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30)])).optional() }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 7 }),
  loader: ({ deps }) => getOverview({ data: { days: deps.days } }),
  head: () => ({ meta: [{ title: 'Overview · Hoardcore' }] }),
  pendingComponent: OverviewPending,
  errorComponent: SourceLoadError,
  component: Overview,
})

function money(amount: number | null, currency: string | null) {
  if (amount === null) return '—'
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: currency ?? 'USD', maximumFractionDigits: 2 }).format(amount) }
  catch { return amount.toFixed(2) }
}

function shortDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'Never'
}

function percent(part: number, whole: number) { return whole ? `${(part / whole * 100).toFixed(1)}%` : '0%' }

function Overview() {
  const data = Route.useLoaderData()
  const days = Route.useSearch().days ?? 7
  const priced = data.changes.filter((item) => item.price !== null && item.previousPrice !== null && item.previousPrice !== 0)
    .sort((a, b) => Math.abs((b.price! - b.previousPrice!) / b.previousPrice!) - Math.abs((a.price! - a.previousPrice!) / a.previousPrice!))
    .slice(0, 6)
  const stockMovers = data.changes.filter((item) => item.stockQuantity !== null && item.previousQuantity !== null && item.stockQuantity !== item.previousQuantity)
    .sort((a, b) => Math.abs(b.stockQuantity! - b.previousQuantity!) - Math.abs(a.stockQuantity! - a.previousQuantity!))
    .slice(0, 6)
  const maxActivity = Math.max(1, ...data.activity.map((item) => item.observations))

  return <main className="w-full space-y-3 px-2 py-3 sm:px-3" id="main-content">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-base font-semibold text-foreground">Inventory overview</h1>
      <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs" aria-label="Change period">
        {[7, 30].map((period) => <Link key={period} to="/" search={{ days: period as 7 | 30 }} className={`rounded px-3 py-1.5 ${days === period ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Last {period} days</Link>)}
      </div>
    </div>

    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Inventory totals">
      <Stat label="Tracked listings" value={data.totals.tracked} detail={`Across ${data.sources.length} sources`} />
      <Stat label="In stock" value={data.totals.inStock} detail={percent(data.totals.inStock, data.totals.tracked) + ' of tracked'} tone="positive" />
      <Stat label="Out of stock" value={data.totals.outOfStock} detail={percent(data.totals.outOfStock, data.totals.tracked) + ' of tracked'} tone="negative" />
      <Stat label="Changed recently" value={data.changeTotal} detail={`${data.newlyOutOfStockTotal} newly out of stock`} />
    </section>

    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,1fr)]">
      <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="source-health-heading">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold" id="source-health-heading">By source</h2><Link to="/sources" className="text-xs text-primary hover:underline">Manage sources →</Link></div>
        {data.sources.length === 0 ? <Empty>No sources yet. Add one on the Sources page to start tracking inventory.</Empty> : <div className="space-y-3">{data.sources.map((source) => <div key={source.id}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1 text-xs"><span className="font-medium text-foreground">{source.name}</span><span className="text-muted-foreground">{source.total.toLocaleString()} listings · {source.lastRunStatus ?? 'never run'} · observed {shortDate(source.lastObservedAt)}</span></div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${source.inStock} in stock and ${source.outOfStock} out of stock`}><div className="bg-emerald-500" style={{ width: percent(source.inStock, source.total) }} /><div className="bg-rose-500" style={{ width: percent(source.outOfStock, source.total) }} /></div>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{source.inStock.toLocaleString()} in stock</span><span>{source.outOfStock.toLocaleString()} out</span></div>
        </div>)}</div>}
      </section>

      <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="activity-heading">
        <h2 className="text-sm font-semibold" id="activity-heading">Collection activity</h2>
        <p className="mt-1 text-xs text-muted-foreground">Observations saved each day · UTC · last 14 days</p>
        <div className="mt-4 flex h-28 items-end gap-1" role="img" aria-label={data.activity.map((item) => `${item.day}: ${item.observations} observations`).join('; ')}>{data.activity.map((item) => <div key={item.day} className="group relative flex h-full flex-1 items-end"><div className="w-full min-h-0 rounded-t bg-primary/75 transition-colors group-hover:bg-primary" style={{ height: `${item.observations ? Math.max(5, item.observations / maxActivity * 100) : 2}%` }} /><span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background group-hover:block">{shortDate(item.day)} · {item.observations} observations · {item.runs} runs</span></div>)}</div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{shortDate(data.activity[0]?.day ?? null)}</span><span>{shortDate(data.activity.at(-1)?.day ?? null)}</span></div>
        <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">Stock quantity known for {data.totals.quantityKnown.toLocaleString()} of {data.totals.tracked.toLocaleString()} listings. Unknown quantities are not zero.</p>
      </section>
    </div>

    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="price-heading"><h2 className="text-sm font-semibold" id="price-heading">Biggest price moves</h2><p className="mb-2 text-xs text-muted-foreground">Current price versus previous observation · {days} days</p>{priced.length ? <ul className="divide-y divide-border">{priced.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs"><ItemLink item={item} /><span className={`shrink-0 font-mono ${item.price! < item.previousPrice! ? 'text-emerald-500' : 'text-rose-500'}`}>{item.price! < item.previousPrice! ? '↓' : '↑'} {Math.abs((item.price! - item.previousPrice!) / item.previousPrice! * 100).toFixed(1)}% <span className="text-muted-foreground">{money(item.previousPrice, item.currency)} → {money(item.price, item.currency)}</span></span></li>)}</ul> : <Empty>No price changes recorded in this period.</Empty>}</section>
      <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="stock-heading"><h2 className="text-sm font-semibold" id="stock-heading">Biggest stock moves</h2><p className="mb-2 text-xs text-muted-foreground">Reported quantity versus previous observation · {days} days</p>{stockMovers.length ? <ul className="divide-y divide-border">{stockMovers.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs"><ItemLink item={item} /><span className={`shrink-0 font-mono ${item.stockQuantity! > item.previousQuantity! ? 'text-emerald-500' : 'text-rose-500'}`}>{item.previousQuantity} → {item.stockQuantity}</span></li>)}</ul> : <Empty>No numeric stock changes yet. Some sources report availability without a count.</Empty>}</section>
      <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="oos-heading"><h2 className="text-sm font-semibold" id="oos-heading">Newly out of stock</h2><p className="mb-2 text-xs text-muted-foreground">Available on the previous observation · {days} days</p>{data.newlyOutOfStock.length ? <ul className="divide-y divide-border">{data.newlyOutOfStock.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs"><ItemLink item={item} /><span className="shrink-0 text-rose-500">{shortDate(item.observedAt)}</span></li>)}</ul> : <Empty>No newly out-of-stock items recorded.</Empty>}</section>
      <section className="rounded-lg border border-border bg-card p-3" aria-labelledby="new-heading"><h2 className="text-sm font-semibold" id="new-heading">Recently first seen</h2><p className="mb-2 text-xs text-muted-foreground">Includes the initial import for a new source · {days} days</p>{data.recentlyAdded.length ? <ul className="divide-y divide-border">{data.recentlyAdded.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs"><ItemLink item={item} /><span className="shrink-0 text-muted-foreground">{shortDate(item.createdAt)}</span></li>)}</ul> : <Empty>No new listings first seen in this period.</Empty>}</section>
    </div>
    <p className="text-xs text-muted-foreground">Mover lists rank the latest 300 changes. Missing-from-collection counts are withheld until complete runs can verify absence; partial collections never imply removal.</p>
  </main>
}

function Stat({ label, value, detail, tone }: { label: string; value: number; detail: string; tone?: 'positive' | 'negative' }) { return <article className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${tone === 'positive' ? 'text-emerald-500' : tone === 'negative' ? 'text-rose-500' : 'text-card-foreground'}`}>{value.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article> }
function ItemLink({ item }: { item: { id: string; title: string; sourceName: string } }) { return <span className="min-w-0"><Link to="/listings/$listingId" params={{ listingId: item.id }} className="block truncate font-medium text-primary hover:underline">{item.title}</Link><span className="text-[11px] text-muted-foreground">{item.sourceName}</span></span> }
function Empty({ children }: { children: React.ReactNode }) { return <p className="py-4 text-xs text-muted-foreground">{children}</p> }
function OverviewPending() { return <main aria-busy="true" aria-label="Loading inventory overview" className="w-full space-y-3 px-2 py-3 sm:px-3" id="main-content"><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="grid gap-2 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div><div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-48 animate-pulse rounded-lg bg-muted" />)}</div></main> }
