import { sql } from 'drizzle-orm'
import { getDatabase } from '~/server/db/index.server'

type SourceRow = {
  id: string
  name: string
  status: string
  total: string
  inStock: string
  outOfStock: string
  quantityKnown: string
  missing: string
  lastObservedAt: Date | string | null
  lastRunStatus: string | null
  lastRunAt: Date | string | null
}

type ChangeRow = {
  id: string
  title: string
  sourceName: string
  price: string | null
  currency: string | null
  previousPrice: string | null
  stockQuantity: number | null
  previousQuantity: number | null
  available: boolean
  previousAvailable: boolean
  observedAt: Date | string
  changeTotal: string
  outOfStockTotal: string
}

type NewRow = { id: string; title: string; sourceName: string; createdAt: Date | string }
type PresenceRow = { id: string; title: string; sourceName: string; kind: string; runId: string | null; at: Date | string | null }
type ActivityRow = { day: string; runs: string; observations: string }

/** Drizzle raw SQL may surface timestamptz as a Date or an ISO string. */
export function overviewTimestamp(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

export async function getOverviewFromDatabase(days: 7 | 30) {
  const db = getDatabase()
  const [sourceResult, changeResult, newResult, activityResult, presenceResult] = await Promise.all([
    db.execute<SourceRow>(sql`
      select s.id, s.display_name as "name", s.status,
        count(c.listing_id) filter (where c.presence = 'present')::text as "total",
        count(c.listing_id) filter (where c.presence = 'present' and c.available)::text as "inStock",
        count(c.listing_id) filter (where c.presence = 'present' and not c.available)::text as "outOfStock",
        count(c.listing_id) filter (where c.presence = 'present' and c.stock_quantity is not null)::text as "quantityKnown",
        count(*) filter (where c.presence = 'missing')::text as "missing",
        max(c.observed_at) as "lastObservedAt",
        last_run.status as "lastRunStatus",
        last_run.created_at as "lastRunAt"
      from catalog_sources s
      left join source_listings l on l.source_id = s.id
      left join source_listing_current c on c.listing_id = l.id
      left join lateral (
        select r.status, r.created_at from collection_runs r
        where r.source_id = s.id order by r.created_at desc limit 1
      ) last_run on true
      group by s.id, s.display_name, s.status, last_run.status, last_run.created_at
      order by s.display_name
    `),
    db.execute<ChangeRow>(sql`
      select l.id, c.title, s.display_name as "sourceName", c.price, c.currency,
        prev.price as "previousPrice", c.stock_quantity as "stockQuantity",
        prev.stock_quantity as "previousQuantity", c.available,
        prev.available as "previousAvailable", c.observed_at as "observedAt",
        count(*) over()::text as "changeTotal",
        count(*) filter (where prev.available and not c.available) over()::text as "outOfStockTotal"
      from source_listing_current c
      join source_listings l on l.id = c.listing_id
      join catalog_sources s on s.id = l.source_id
      join lateral (
        select o.price, o.stock_quantity, o.available, o.observed_at
        from source_listing_observations o
        where o.listing_id = l.id and o.observed_at < c.observed_at
        order by o.observed_at desc limit 1
      ) prev on true
      where c.presence = 'present'
        and c.observed_at >= now() - ${days} * interval '1 day'
        and (c.price is distinct from prev.price
          or c.stock_quantity is distinct from prev.stock_quantity
          or c.available is distinct from prev.available)
      order by c.observed_at desc
      limit 300
    `),
    db.execute<NewRow>(sql`
      select l.id, c.title, s.display_name as "sourceName", l.created_at as "createdAt"
      from source_listings l
      join source_listing_current c on c.listing_id = l.id and c.presence = 'present'
      join catalog_sources s on s.id = l.source_id
      where l.created_at >= now() - ${days} * interval '1 day'
      order by l.created_at desc limit 8
    `),
    db.execute<ActivityRow>(sql`
      with days as (
        select generate_series(
          (now() at time zone 'UTC')::date - 13,
          (now() at time zone 'UTC')::date,
          interval '1 day'
        )::date as day
      ), runs as (
        select (created_at at time zone 'UTC')::date as day, count(*)::text as count
        from collection_runs where created_at >= now() - interval '14 days' group by 1
      ), observations as (
        select (observed_at at time zone 'UTC')::date as day, count(*)::text as count
        from source_listing_observations where observed_at >= now() - interval '14 days' group by 1
      )
      select days.day::text, coalesce(runs.count, '0') as runs,
        coalesce(observations.count, '0') as observations
      from days left join runs using (day) left join observations using (day)
      order by days.day
    `),
    db.execute<PresenceRow>(sql`
      select l.id, c.title, s.display_name as "sourceName",
        case when c.presence = 'missing' then 'missing' else 'reappeared' end as kind,
        case when c.presence = 'missing' then c.missing_run_id else c.reappeared_run_id end as "runId",
        case when c.presence = 'missing' then c.missing_since else c.reappeared_at end as at
      from source_listing_current c join source_listings l on l.id = c.listing_id
      join catalog_sources s on s.id = l.source_id
      where (c.presence = 'missing' and c.missing_since >= now() - ${days} * interval '1 day')
         or (c.presence = 'present' and c.reappeared_at >= now() - ${days} * interval '1 day')
      order by at desc limit 100
    `),
  ])

  const sources = sourceResult.rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    total: Number(row.total),
    inStock: Number(row.inStock),
    outOfStock: Number(row.outOfStock),
    quantityKnown: Number(row.quantityKnown),
    missing: Number(row.missing),
    lastObservedAt: overviewTimestamp(row.lastObservedAt),
    lastRunStatus: row.lastRunStatus,
    lastRunAt: overviewTimestamp(row.lastRunAt),
  }))
  const changes = changeResult.rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceName: row.sourceName,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    previousPrice: row.previousPrice === null ? null : Number(row.previousPrice),
    stockQuantity: row.stockQuantity,
    previousQuantity: row.previousQuantity,
    available: row.available,
    previousAvailable: row.previousAvailable,
    observedAt: overviewTimestamp(row.observedAt)!,
  }))
  return {
    days,
    sources,
    totals: {
      tracked: sources.reduce((sum, source) => sum + source.total, 0),
      inStock: sources.reduce((sum, source) => sum + source.inStock, 0),
      outOfStock: sources.reduce((sum, source) => sum + source.outOfStock, 0),
      quantityKnown: sources.reduce((sum, source) => sum + source.quantityKnown, 0),
      missing: sources.reduce((sum, source) => sum + source.missing, 0),
    },
    changes,
    changeTotal: Number(changeResult.rows[0]?.changeTotal ?? 0),
    newlyOutOfStockTotal: Number(changeResult.rows[0]?.outOfStockTotal ?? 0),
    newlyOutOfStock: changes.filter((change) => change.previousAvailable && !change.available).slice(0, 8),
    recentlyAdded: newResult.rows.map((row) => ({ ...row, createdAt: overviewTimestamp(row.createdAt)! })),
    activity: activityResult.rows.map((row) => ({ day: row.day, runs: Number(row.runs), observations: Number(row.observations) })),
    presenceChanges: presenceResult.rows.map((row) => ({ ...row, at: overviewTimestamp(row.at) })),
  }
}
