import { useActiveTheme } from './active-theme'
import { THEMES, type AppTheme } from './theme.config'

export function ThemeSelector() {
  const { activeTheme, setActiveTheme } = useActiveTheme()

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="hidden md:inline">Theme</span>
      <select
        aria-label="Theme preset"
        className="h-8 w-[4.5rem] rounded-md border border-input bg-background px-1 text-xs text-foreground shadow-xs outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 sm:h-9 sm:w-auto sm:px-2.5 sm:text-sm"
        value={activeTheme}
        onChange={(event) => setActiveTheme(event.target.value as AppTheme)}
      >
        {THEMES.map((theme) => (
          <option key={theme.value} value={theme.value}>
            {theme.name}
          </option>
        ))}
      </select>
    </label>
  )
}
