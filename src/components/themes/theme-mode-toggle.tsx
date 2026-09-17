import { useTheme } from 'next-themes'
import { useEffect, useState, type MouseEvent } from 'react'

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => unknown
}

export function ThemeModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  function toggleMode(event: MouseEvent<HTMLButtonElement>) {
    if (!mounted) return

    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    const transitionDocument = document as DocumentWithViewTransition

    root.style.setProperty('--theme-transition-x', `${event.clientX}px`)
    root.style.setProperty('--theme-transition-y', `${event.clientY}px`)

    if (!transitionDocument.startViewTransition) {
      setTheme(nextTheme)
      return
    }

    transitionDocument.startViewTransition(() => setTheme(nextTheme))
  }

  const switchingTo = resolvedTheme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      aria-label={`Switch to ${switchingTo} mode`}
      title={`Switch to ${switchingTo} mode`}
      disabled={!mounted}
      onClick={toggleMode}
      className="inline-flex size-8 items-center justify-center rounded-md border border-input bg-background text-foreground shadow-xs transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:size-9"
    >
      {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}
