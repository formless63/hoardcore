import { sql, type SQL } from 'drizzle-orm'
import type { Database } from '~/server/db/index.server'
import { changesSearchSchema, type ChangesSearch } from './changes.schemas'
import { getListingMediaCaptures } from '~/features/media/media.server'

type Run = { id: string; sourceId: string; status: string; at: string; completedAt: string }
type Change = { listingId: string; title: string; sku: string | null; sourceName: string; sourceId: string; beforeRunId: string | null; afterRunId: string; at: string; kinds: string[]; beforePrice: string | null; afterPrice: string | null; beforeCurrency: string | null; afterCurrency: string | null; beforeAvailable: boolean | null; afterAvailable: boolean | null; beforeQuantity: number | null; afterQuantity: number | null; delta: string | null; percent: string | null; beforePresent: boolean | null; afterPresent: boolean | null; beforeCarried: boolean; afterCarried: boolean; beforeQuantityCarried: boolean; afterQuantityCarried: boolean; beforeValueRunId: string | null; afterValueRunId: string | null; beforePriceAt: string | null; afterPriceAt: string | null }

// Hydration is a read model, never a fabricated source observation. Preserve the
// evidence run/time of each price and mark stale quantity separately.
function snapshot(at: SQL) {
  return sql`select o.*,coalesce(o.price,pv.price) resolved_price,
    coalesce(o.stock_quantity,qv.stock_quantity) resolved_quantity,
    coalesce(case when o.price is not null then o.value_run_id else pv.value_run_id end,o.value_run_id) price_run_id,
    case when o.price is not null then o.observed_at else pv.observed_at end price_at,
    o.price is null and pv.price is not null price_carried,
    o.stock_quantity is null and qv.stock_quantity is not null quantity_carried
    from (select * from observations where listing_id=l.id and at<=${at}
      order by at desc,observed_at desc,id limit 1) o
    left join lateral (select price,value_run_id,observed_at from observations prior
      where o.price is null and prior.listing_id=l.id and prior.at<=o.at and prior.price is not null
      and coalesce(nullif(trim(prior.currency),''),'USD')=coalesce(nullif(trim(o.currency),''),'USD')
      order by prior.at desc,prior.observed_at desc,prior.id limit 1) pv on true
    left join lateral (select stock_quantity from observations prior
      where o.stock_quantity is null and prior.listing_id=l.id and prior.at<=o.at and prior.stock_quantity is not null
      and l.id in (select listing_id from known_quantity_listings)
      order by prior.at desc,prior.observed_at desc,prior.id limit 1) qv on true`
}

/** Read-only reconstruction: successful complete runs establish absence;
 * partial runs update only what they observed, and 304 runs carry state forward. */
export async function readChanges(db: Database, input: ChangesSearch) {
  const search = changesSearchSchema.parse(input)
  // One MVCC snapshot keeps run selectors, counts, and rows coherent during collection.
  return db.transaction(async tx => {
    const sources = (await tx.execute<{ id: string; name: string }>(sql`select id, display_name as name from catalog_sources order by display_name,id`)).rows
    const runs = (await tx.execute<Run>(sql`select r.id, r.source_id as "sourceId", status,
      coalesce(r.observed_at,e.captured_at,r.started_at,r.created_at)::text as at, coalesce(completed_at,r.created_at)::text as "completedAt"
      from collection_runs r left join source_evidence e on e.run_id=r.id where status in ('succeeded','partial','not_modified') order by coalesce(r.observed_at,e.captured_at,r.started_at,r.created_at) desc,r.id desc`)).rows
    const sourceId = search.sourceId ?? (search.mode === 'runs' ? sources[0]?.id : undefined)
    const sourceRuns = runs.filter(run => run.sourceId === sourceId)
    const after = search.mode === 'runs' ? (search.afterRunId ? runs.find(run => run.id === search.afterRunId) : sourceRuns[0]) : undefined
    const before = search.mode === 'runs' ? (search.beforeRunId ? runs.find(run => run.id === search.beforeRunId) : sourceRuns.find(run => after && new Date(run.at) < new Date(after.at))) : undefined
    if (search.sourceId && !sources.some(source => source.id === search.sourceId)) throw new Error('Source not found')
    if (search.mode === 'runs' && (search.beforeRunId && !before || search.afterRunId && !after)) throw new Error('Selected run is unavailable or has no completed result')
    if (before && before.sourceId !== sourceId || after && after.sourceId !== sourceId) throw new Error('Choose both runs from the selected source')
    if (before && after && (before.sourceId !== sourceId || after.sourceId !== sourceId || new Date(before.at) >= new Date(after.at))) throw new Error('Choose an earlier and later run from the same source')
    const from = search.from ?? new Date(Date.now() - search.days * 86400000).toISOString()
    const to = search.to ?? new Date().toISOString()
    const metadata = { sources, runs: sourceRuns, sourceId: sourceId ?? null, before: before ?? null, after: after ?? null, from, to }
    if (search.mode === 'runs' && (!before || !after)) return { ...metadata, rows: [], total: 0, counts: Object.fromEntries(new Map<string, number>()), page: 0, message: 'This source needs two completed run results to compare. The date-range feed can show its first observed listings.' }
    const pairs = search.mode === 'runs'
      ? sql`select ${sourceId}::uuid source_id, ${before!.id}::uuid before_id, ${after!.id}::uuid after_id, ${before!.at}::timestamptz before_at, ${after!.at}::timestamptz after_at`
      : sql`select source_id, before_id, id after_id, before_at, at after_at from (
          select source_id,id,snapshot_at at,coalesce(completed_at,created_at) finished,
            lag(id) over w before_id,lag(snapshot_at) over w before_at
          from run_history where status in ('succeeded','partial','not_modified') ${sourceId ? sql`and source_id=${sourceId}::uuid` : sql``}
          window w as (partition by source_id order by snapshot_at,id)
        ) r where finished >= ${from}::timestamptz and finished <= ${to}::timestamptz`
    const cte = sql`with run_history as materialized (
      select r.*,coalesce(r.observed_at,e.captured_at,r.started_at,r.created_at) snapshot_at
      from collection_runs r left join source_evidence e on e.run_id=r.id
    ), observations as not materialized (
      select o.*,r.id value_run_id,coalesce(r.snapshot_at,o.observed_at) at
      from source_listing_observations o left join source_evidence e on e.id=o.evidence_id left join run_history r on r.id=e.run_id
      where r.id is null or r.status in ('succeeded','partial')
    ), known_quantity_listings as materialized (
      select distinct listing_id from source_listing_observations where stock_quantity is not null
    ), pairs as (${pairs}), snapshots as (
      select l.id "listingId", l.source_id "sourceId", s.display_name "sourceName", v.sku,
        coalesce(a.title,b.title) title,p.before_id "beforeRunId",p.after_id "afterRunId",p.after_at::text at,
        b.resolved_price "beforePrice",a.resolved_price "afterPrice",
        coalesce(nullif(trim(b.currency),''),'USD') "beforeCurrency",
        coalesce(nullif(trim(a.currency),''),'USD') "afterCurrency",
        b.available "beforeAvailable",a.available "afterAvailable",b.resolved_quantity "beforeQuantity",a.resolved_quantity "afterQuantity",
        coalesce(b.price_carried or b.value_run_id is distinct from p.before_id,false) "beforeCarried",
        coalesce(a.price_carried or a.value_run_id is distinct from p.after_id,false) "afterCarried",
        coalesce(b.quantity_carried or b.value_run_id is distinct from p.before_id,false) "beforeQuantityCarried",
        coalesce(a.quantity_carried or a.value_run_id is distinct from p.after_id,false) "afterQuantityCarried",
        b.price_run_id "beforeValueRunId",a.price_run_id "afterValueRunId",
        b.price_at::text "beforePriceAt",a.price_at::text "afterPriceAt",
        case when b.id is null then null else b.at >= bc.at or bc.at is null end "beforePresent",
        case when a.id is null then null else a.at >= ac.at or ac.at is null end "afterPresent"
      from pairs p join source_listings l on l.source_id=p.source_id join catalog_sources s on s.id=l.source_id
      join catalog_variants v on v.id=l.variant_id
      left join lateral (select snapshot_at at from run_history
        where source_id=p.source_id and status='succeeded' and snapshot_at<=p.before_at
        order by snapshot_at desc limit 1) bc on true
      left join lateral (select snapshot_at at from run_history
        where source_id=p.source_id and status='succeeded' and snapshot_at<=p.after_at
        order by snapshot_at desc limit 1) ac on true
      left join lateral (${snapshot(sql`p.before_at`)}) b on true
      left join lateral (${snapshot(sql`p.after_at`)}) a on true
      where a.id is not null or b.id is not null
    ), classified as (
      select *,array_remove(array[
        case when "beforePresent" is null and "afterPresent" then 'new' end,
        case when "beforePresent" and not "afterPresent" then 'missing' end,
        case when not "beforePresent" and "afterPresent" then 'reappeared' end,
        case when "beforePresent" and "afterPresent" and "beforePrice" is distinct from "afterPrice" then 'price_changed' end,
        case when "beforePresent" and "afterPresent" and "beforeCurrency"="afterCurrency" and "afterPrice"<"beforePrice" then 'price_drop' end,
        case when "beforePresent" and "afterPresent" and "beforeCurrency"="afterCurrency" and "afterPrice">"beforePrice" then 'price_increase' end,
        case when "beforePresent" and "afterPresent" and ("beforeAvailable" is distinct from "afterAvailable" or "beforeQuantity" is distinct from "afterQuantity") then 'stock_changed' end,
        case when "beforePresent" and "afterPresent" and "beforeCurrency" is distinct from "afterCurrency" then 'currency_changed' end
      ],null) kinds,
      case when "beforePresent" and "afterPresent" and "beforeCurrency"="afterCurrency" then "afterPrice"-"beforePrice" end delta,
      case when "beforePresent" and "afterPresent" and "beforeCurrency"="afterCurrency" and "beforePrice">0 then ("afterPrice"-"beforePrice")/"beforePrice"*100 end percent
      from snapshots
    ), searched as (select * from classified where cardinality(kinds)>0
      ${search.query ? sql`and (strpos(lower(title),lower(${search.query}))>0 or strpos(lower(coalesce(sku,'')),lower(${search.query}))>0)` : sql``}
    ), filtered as (select * from searched ${search.kind === 'all' ? sql`` : sql`where ${search.kind}=any(kinds)`})`
    const summary = (await tx.execute<{ total: string; counts: Record<string,number> }>(sql`${cte}
      select (select count(*)::text from filtered) total,
        coalesce((select jsonb_object_agg(kind,count) from (
          select kind,count(*) count from searched cross join lateral unnest(kinds) kind group by kind
        ) counts),'{}'::jsonb) counts`)).rows[0]
    const total = Number(summary.total)
    const page = Math.min(search.page, Math.max(0, Math.ceil(total / search.pageSize) - 1))
    const order = search.sort === 'drop' ? sql`delta asc nulls last` : search.sort === 'increase' ? sql`delta desc nulls last` : search.sort === 'percent' ? sql`abs(percent) desc nulls last` : sql`at::timestamptz desc`
    const rows = (await tx.execute<Change>(sql`${cte} select * from filtered order by ${order},"sourceId","listingId","afterRunId" limit ${search.pageSize} offset ${page * search.pageSize}`)).rows
    // Representative cached media is current, not a reconstruction of old images.
    const captures = await getListingMediaCaptures(db, rows.map(row => row.listingId))
    return { ...metadata, rows: rows.map(row => ({ ...row, mediaCaptureId: captures.get(row.listingId)?.id ?? null })), total, counts: summary.counts, page, message: null }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
