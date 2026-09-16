import { createFileRoute } from '@tanstack/react-router'
import { checkDatabaseConnection } from '~/server/db/index.server'

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await checkDatabaseConnection()

          return Response.json(
            { status: 'ready' },
            {
              headers: { 'Cache-Control': 'no-store' },
            },
          )
        } catch (error) {
          console.error('Database readiness check failed', error)

          return Response.json(
            { status: 'unavailable' },
            {
              status: 503,
              headers: { 'Cache-Control': 'no-store' },
            },
          )
        }
      },
    },
  },
})
