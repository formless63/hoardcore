import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/hooks/loxep/$connectionId')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { handleLoxepOutcomeWebhook } = await import('~/server/loxep-outcome-webhook.server')
        return handleLoxepOutcomeWebhook(request, params.connectionId)
      },
    },
  },
})
