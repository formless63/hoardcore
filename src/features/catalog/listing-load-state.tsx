import { useRouter } from '@tanstack/react-router'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted motion-reduce:animate-none ${className}`} />
}

export function ListingsPending() {
  return <main id="main-content" aria-busy="true" aria-label="Loading listings" className="w-full px-1 py-2 sm:px-2">
    <Block className="h-8 w-full max-w-sm" />
    <div className="mt-2 flex gap-2"><Block className="h-7 w-24" /><Block className="h-7 w-24" /><Block className="h-7 w-24" /></div>
    <div className="mt-3 overflow-hidden rounded border border-border bg-card">
      <div className="h-9 border-b border-border bg-muted/40" />
      {Array.from({ length: 9 }, (_, index) => <div key={index} className="flex h-11 items-center gap-3 border-b border-border px-2 last:border-0"><Block className="size-7 shrink-0" /><Block className="h-3 w-28 shrink-0" /><Block className="h-3 min-w-0 flex-1" /><Block className="h-3 w-16 shrink-0" /><Block className="h-3 w-12 shrink-0" /></div>)}
    </div>
  </main>
}

export function ListingDetailPending() {
  return <main id="main-content" aria-busy="true" aria-label="Loading listing detail" className="w-full px-2 py-3 sm:px-3">
    <Block className="h-4 w-20" />
    <Block className="mt-4 h-3 w-28" /><Block className="mt-2 h-7 w-full max-w-xl" />
    <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6"><Block className="aspect-square w-full max-w-sm" /><div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 7 }, (_, index) => <div key={index} className="min-w-0"><Block className="h-3 w-14 max-w-full" /><Block className="mt-2 h-4 w-24 max-w-full" /></div>)}</div></div>
    <Block className="mt-5 h-16 w-full" /><Block className="mt-5 h-20 w-full" />
  </main>
}

export function ListingLoadError() {
  const router = useRouter()
  return <main id="main-content" className="w-full px-2 py-3 sm:px-3"><Alert title="Could not load listings"><p>Please try again.</p><Button className="mt-3" size="small" variant="secondary" onClick={() => void router.invalidate()}>Try again</Button></Alert></main>
}
