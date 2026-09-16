import { createFileRoute } from '@tanstack/react-router'
import { checkDatabaseConnection } from '~/server/db/index.server'
import { getWorkerStatus } from '~/server/worker/lifecycle.server'

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await checkDatabaseConnection()
          const worker = getWorkerStatus()
          if (worker.state !== 'ready') {
            return Response.json(
              { status: 'unavailable', worker: worker.state },
              { status: 503, headers: { 'Cache-Control': 'no-store' } },
            )
          }

          return Response.json(
            { status: 'ready', worker: worker.state },
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
