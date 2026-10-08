import { sql } from 'drizzle-orm'
import type { Database } from '~/server/db/index.server'
import { changesSearchSchema, type ChangesSearch } from './changes.schemas'

type Run = { id: string; sourceId: string; status: string; at: string; completedAt: string }
type Change = { listingId: string; title: string; sku: string | null; sourceName: string; sourceId: string; beforeRunId: string | null; afterRunId: string; at: string; kinds: string[]; beforePrice: string | null; afterPrice: string | null; beforeCurrency: string | null; afterCurrency: string | null; beforeAvailable: boolean | null; afterAvailable: boolean | null; beforeQuantity: number | null; afterQuantity: number | null; delta: string | null; percent: string | null; beforePresent: boolean | null; afterPresent: boolean | null }

/** Read-only reconstruction: successful complete runs establish absence;
 * partial runs update only what they observed, and 304 runs carry state forward. */
export async function readChanges(db: Database, input: ChangesSearch) {
  const search = changesSearchSchema.parse(input)
  // One MVCC snapshot keeps run selectors, counts, and rows coherent during collection.
  return db.transaction(async tx => {
    const sources = (await tx.execute<{ id: string; name: string }>(sql`select id, display_name as name from catalog_sources order by display_name,id`)).rows
    const runs = (await tx.execute<Run>(sql`select id, source_id as "sourceId", status,
      coalesce(observed_at,started_at,created_at)::text as at, coalesce(completed_at,created_at)::text as "completedAt"
      from collection_runs where status in ('succeeded','partial','not_modified') order by coalesce(observed_at,started_at,created_at) desc,id desc`)).rows
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
          select source_id,id,coalesce(observed_at,started_at,created_at) at,coalesce(completed_at,created_at) finished,
            lag(id) over w before_id,lag(coalesce(observed_at,started_at,created_at)) over w before_at
          from collection_runs where status in ('succeeded','partial','not_modified') ${sourceId ? sql`and source_id=${sourceId}::uuid` : sql``}
          window w as (partition by source_id order by coalesce(observed_at,started_at,created_at),id)
        ) r where finished >= ${from}::timestamptz and finished <= ${to}::timestamptz`
    const cte = sql`with pairs as (${pairs}), snapshots as (
      select l.id "listingId", l.source_id "sourceId", s.display_name "sourceName", v.sku,
        coalesce(a.title,b.title) title,p.before_id "beforeRunId",p.after_id "afterRunId",p.after_at::text at,
        b.price "beforePrice",a.price "afterPrice",
        coalesce(nullif(trim(b.currency),''),'USD') "beforeCurrency",
        coalesce(nullif(trim(a.currency),''),'USD') "afterCurrency",
        b.available "beforeAvailable",a.available "afterAvailable",b.stock_quantity "beforeQuantity",a.stock_quantity "afterQuantity",
        case when b.id is null then null else b.at >= bc.at or bc.at is null end "beforePresent",
        case when a.id is null then null else a.at >= ac.at or ac.at is null end "afterPresent"
      from pairs p join source_listings l on l.source_id=p.source_id join catalog_sources s on s.id=l.source_id
      join catalog_variants v on v.id=l.variant_id
      left join lateral (select coalesce(observed_at,started_at,created_at) at from collection_runs
        where source_id=p.source_id and status='succeeded' and coalesce(observed_at,started_at,created_at)<=p.before_at
        order by coalesce(observed_at,started_at,created_at) desc limit 1) bc on true
      left join lateral (select coalesce(observed_at,started_at,created_at) at from collection_runs
        where source_id=p.source_id and status='succeeded' and coalesce(observed_at,started_at,created_at)<=p.after_at
        order by coalesce(observed_at,started_at,created_at) desc limit 1) ac on true
      left join lateral (select o.*,coalesce(r.observed_at,r.started_at,r.created_at,o.observed_at) at
        from source_listing_observations o left join source_evidence e on e.id=o.evidence_id left join collection_runs r on r.id=e.run_id
        where o.listing_id=l.id and (r.id is null or r.status in ('succeeded','partial'))
          and coalesce(r.observed_at,r.started_at,r.created_at,o.observed_at)<=p.before_at
        order by coalesce(r.observed_at,r.started_at,r.created_at,o.observed_at) desc,o.observed_at desc,o.id limit 1) b on true
      left join lateral (select o.*,coalesce(r.observed_at,r.started_at,r.created_at,o.observed_at) at
        from source_listing_observations o left join source_evidence e on e.id=o.evidence_id left join collection_runs r on r.id=e.run_id
        where o.listing_id=l.id and (r.id is null or r.status in ('succeeded','partial'))
          and coalesce(r.observed_at,r.started_at,r.created_at,o.observed_at)<=p.after_at
        order by coalesce(r.observed_at,r.started_at,r.created_at,o.observed_at) desc,o.observed_at desc,o.id limit 1) a on true
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
    const counts = (await tx.execute<{ kind: string; count: string }>(sql`${cte} select kind,count(*)::text count from searched cross join lateral unnest(kinds) kind group by kind`)).rows
    const total = Number((await tx.execute<{ total: string }>(sql`${cte} select count(*)::text total from filtered`)).rows[0].total)
    const page = Math.min(search.page, Math.max(0, Math.ceil(total / search.pageSize) - 1))
    const order = search.sort === 'drop' ? sql`delta asc nulls last` : search.sort === 'increase' ? sql`delta desc nulls last` : search.sort === 'percent' ? sql`abs(percent) desc nulls last` : sql`at::timestamptz desc`
    const rows = (await tx.execute<Change>(sql`${cte} select * from filtered order by ${order},"sourceId","listingId","afterRunId" limit ${search.pageSize} offset ${page * search.pageSize}`)).rows
    return { ...metadata, rows, total, counts: Object.fromEntries(counts.map(row => [row.kind, Number(row.count)])), page, message: null }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
}
