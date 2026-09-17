import { useRouter } from '@tanstack/react-router'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'

export function SettingsPending() {
  return <main id="main-content" aria-busy="true" aria-label="Loading settings" className="w-full px-2 py-3 sm:px-3">
    <div className="h-5 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div className="mt-3 h-52 max-w-xl animate-pulse rounded border border-border bg-card motion-reduce:animate-none" />
  </main>
}

export function SettingsLoadError() {
  const router = useRouter()
  return <main id="main-content" className="w-full px-2 py-3 sm:px-3"><Alert title="Could not load settings"><p>Please try again.</p><Button className="mt-3" size="small" variant="secondary" onClick={() => void router.invalidate()}>Try again</Button></Alert></main>
}
