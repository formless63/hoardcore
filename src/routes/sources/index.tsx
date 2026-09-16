import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { buttonStyles } from '~/components/ui/button'
import { SourceList } from '~/features/sources/source-list'
import {
  SourceListPending,
  SourceLoadError,
} from '~/features/sources/source-load-state'
import { listCatalogSources, listCollectionRuns } from '~/features/sources/sources.functions'
import { getPublicSession } from '~/features/auth/auth.functions'
import { getOperatorSettings } from '~/features/settings/settings.functions'
import { getMediaCaptureAvailability, listMediaCaptureRuns } from '~/features/media/media.functions'

export const Route = createFileRoute('/sources/')({
  beforeLoad: async ({ location }) => {
    if (!(await getPublicSession())) throw redirect({ to: '/login' })
  },
  head: () => ({ meta: [{ title: 'Sources · Hoardcore' }] }),
  loader: async () => {
    const [{ sources }, { runs }, settings, mediaCapture] = await Promise.all([listCatalogSources(), listCollectionRuns({ data: {} }), getOperatorSettings(), getMediaCaptureAvailability()])
    const latestRuns = Object.fromEntries(sources.map((source) => [source.id, runs.find((run) => run.sourceId === source.id)]))
    const mediaHistory = await Promise.all(sources.map((source) => listMediaCaptureRuns({ data: { sourceId: source.id } })))
    const latestMediaRuns = Object.fromEntries(sources.map((source, index) => [source.id, mediaHistory[index]?.[0]]))
    return { sources, latestRuns, latestMediaRuns, settings, mediaCapture }
  },
  pendingComponent: SourceListPending,
  errorComponent: SourceLoadError,
  component: SourcesPage,
})

function SourcesPage() {
  const { sources, latestRuns, latestMediaRuns, settings, mediaCapture } = Route.useLoaderData()

  return (
    <main className="w-full px-2 py-3 sm:px-3" id="main-content">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold text-foreground">Catalog sources</h1>
        <Link to="/sources/new" className={buttonStyles({ className: 'self-start' })}>
          Add source
        </Link>
      </div>

      <section className="mt-3" aria-label="Registered catalog sources">
        <SourceList sources={sources} latestRuns={latestRuns} latestMediaRuns={latestMediaRuns} defaultRequestLimit={settings.defaultCollectionRequestLimit} mediaCaptureEnabled={mediaCapture.enabled} />
      </section>
    </main>
  )
}
