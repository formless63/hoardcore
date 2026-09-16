import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireSession } from '~/server/auth.server'
import { getDatabase } from '~/server/db/index.server'
import { getAuthenticatedMediaVariant } from '~/features/media/media.server'
import { mediaVariantSchema } from '~/features/media/media.schemas'

const paramsSchema = z.object({ captureId: z.uuid(), variant: mediaVariantSchema })

export const Route = createFileRoute('/api/media/$captureId/$variant')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        await requireSession()
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return new Response('Not found', { status: 404 })
        const media = await getAuthenticatedMediaVariant(getDatabase(), parsed.data.captureId, parsed.data.variant)
        if (!media) return new Response('Not found', { status: 404 })
        return new Response(new Uint8Array(media.data), {
          headers: {
            'Content-Type': media.contentType,
            'Content-Length': String(media.data.byteLength),
            'Cache-Control': 'private, max-age=86400',
            'ETag': `\"${media.sha256}\"`,
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})
