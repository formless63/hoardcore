import { createFileRoute } from '@tanstack/react-router'
import { getAuth } from '~/server/auth.server'

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: {
    GET: ({ request }) => privateAuthResponse(request),
    POST: ({ request }) => privateAuthResponse(request),
  } },
})

async function privateAuthResponse(request: Request): Promise<Response> {
  const response = await getAuth().handler(request)
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
