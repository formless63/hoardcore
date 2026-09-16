import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getDatabase } from '~/server/db/index.server'
import { authorizeResearchApiToken, importResearchResult, RESEARCH_WRITE_SCOPE } from '~/features/research/research.server'

const bodySchema = z.object({ result: z.unknown() })

function bearer(request: Request) {
  const value = request.headers.get('authorization')
  const match = value?.match(/^Bearer (hc_rsch_[A-Za-z0-9_-]{20,})$/u)
  return match?.[1]
}

export const Route = createFileRoute('/api/research/import')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const maxBytes = 5_000_000
        const contentLength = Number(request.headers.get('content-length'))
        if (Number.isFinite(contentLength) && contentLength > maxBytes) return Response.json({ error: 'Research payload is too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
        const token = bearer(request)
        if (!token) return Response.json({ error: 'A scoped Bearer token is required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
        const principal = await authorizeResearchApiToken(getDatabase(), token, RESEARCH_WRITE_SCOPE)
        if (!principal) return Response.json({ error: 'Invalid, expired, revoked, or insufficient token' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
        try {
          const raw = await request.text()
          if (Buffer.byteLength(raw, 'utf8') > maxBytes) return Response.json({ error: 'Research payload is too large' }, { status: 413, headers: { 'Cache-Control': 'no-store' } })
          const parsed = bodySchema.parse(JSON.parse(raw))
          const imported = await importResearchResult(getDatabase(), principal.userId, parsed.result)
          return Response.json(imported, { status: 201, headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : 'Invalid research import' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
        }
      },
    },
  },
})
