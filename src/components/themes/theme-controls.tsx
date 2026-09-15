import { ThemeModeToggle } from './theme-mode-toggle'
import { ThemeSelector } from './theme-selector'

export function ThemeControls() {
  return (
    <div className="flex items-center gap-2">
      <ThemeSelector />
      <ThemeModeToggle />
    </div>
  )
}
