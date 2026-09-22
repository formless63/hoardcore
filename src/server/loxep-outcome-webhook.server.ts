import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDatabase } from '~/server/db/index.server'
import { loxepConnections } from '~/server/db/schema'
import { receiveLoxepOutcome, LoxepOutcomeConflictError } from '~/features/loxep/loxep.server'
import { tokensMatch } from '~/features/loxep/loxep-crypto.server'

const MAX_BODY_BYTES = 256 * 1024
const WINDOW_MS = 60_000
const PRE_AUTH_MAX_REQUESTS = 30
const POST_AUTH_MAX_REQUESTS = 60
const MAX_TRACKED_KEYS = 2_048
const CONNECTION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DUMMY_CONNECTION_ID = '00000000-0000-0000-0000-000000000000'

type Counter = { startedAt: number; count: number }

class FixedWindowLimiter {
  private readonly counters = new Map<string, Counter>()

  take(key: string, max: number): boolean {
    const now = Date.now()
    const current = this.counters.get(key)
    if (current === undefined || now - current.startedAt >= WINDOW_MS) {
      if (current !== undefined) this.counters.delete(key)
      if (this.counters.size >= MAX_TRACKED_KEYS) {
        const oldest = this.counters.keys().next().value
        if (oldest !== undefined) this.counters.delete(oldest)
      }
      this.counters.set(key, { startedAt: now, count: 1 })
      return true
    }
    current.count = Math.min(current.count + 1, max + 1)
    return current.count <= max
  }
}

const preAuthLimiter = new FixedWindowLimiter()
const postAuthLimiter = new FixedWindowLimiter()

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function bearer(request: Request): string {
  return request.headers.get('authorization')?.match(/^Bearer (.+)$/u)?.[1] ?? ''
}

function requestIsTooLarge(request: Request): boolean {
  const declared = Number(request.headers.get('content-length'))
  return Number.isFinite(declared) && declared > MAX_BODY_BYTES
}

async function readCapped(request: Request): Promise<string | null> {
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const next = await reader.read()
    if (next.done) break
    total += next.value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(next.value)
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
}

function invalidOutcomeError(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')
}

export async function handleLoxepOutcomeWebhook(request: Request, connectionId: string): Promise<Response> {
  if (requestIsTooLarge(request)) return json(413, { error: 'payload_too_large' })

  const presented = bearer(request)
  const validConnectionId = CONNECTION_UUID_PATTERN.test(connectionId)
  const lookupConnectionId = validConnectionId ? connectionId : DUMMY_CONNECTION_ID
  const attemptKey = createHash('sha256')
    .update(lookupConnectionId, 'utf8')
    .update('\0', 'utf8')
    .update(presented, 'utf8')
    .digest('base64url')
  if (!preAuthLimiter.take(attemptKey, PRE_AUTH_MAX_REQUESTS)) return json(429, { error: 'rate_limited' })

  const [connection] = await getDatabase()
    .select({ callbackTokenHash: loxepConnections.callbackTokenHash, status: loxepConnections.status })
    .from(loxepConnections)
    .where(and(eq(loxepConnections.id, lookupConnectionId), eq(loxepConnections.status, 'active')))
    .limit(1)
  if (!validConnectionId || !tokensMatch(presented, connection?.callbackTokenHash)) {
    return json(401, { error: 'unauthorized' })
  }
  if (!postAuthLimiter.take(connectionId, POST_AUTH_MAX_REQUESTS)) return json(429, { error: 'rate_limited' })

  const body = await readCapped(request)
  if (body === null) return json(413, { error: 'payload_too_large' })
  try {
    const result = await receiveLoxepOutcome(getDatabase(), connectionId, body)
    return json(202, { received: true, duplicate: result.duplicate })
  } catch (error) {
    if (invalidOutcomeError(error)) return json(400, { error: 'invalid_payload' })
    if (error instanceof LoxepOutcomeConflictError) return json(409, { error: 'event_conflict' })
    throw error
  }
}
