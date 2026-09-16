import { useRouter } from '@tanstack/react-router'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'

export function SourceLoadError() {
  const router = useRouter()

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" id="main-content">
      <div className="max-w-xl">
        <Alert title="Could not load catalog sources">
          <p>Check the database connection and try again.</p>
          <Button
            className="mt-4"
            size="small"
            variant="secondary"
            onClick={() => void router.invalidate()}
          >
            Try again
          </Button>
        </Alert>
      </div>
    </main>
  )
}

export function SourceListPending() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading catalog sources"
      className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6"
      id="main-content"
    >
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="mt-3 h-5 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="mt-8 space-y-3">
        <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-24 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    </main>
  )
}
