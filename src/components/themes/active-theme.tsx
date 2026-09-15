import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isAppTheme,
  type AppTheme,
} from './theme.config'

type ActiveThemeContextValue = {
  activeTheme: AppTheme
  setActiveTheme: (theme: AppTheme) => void
}

const ActiveThemeContext = createContext<ActiveThemeContextValue | null>(null)

export function ActiveThemeProvider({ children }: PropsWithChildren) {
  const [activeTheme, setActiveThemeState] = useState<AppTheme>(DEFAULT_THEME)

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    const initialTheme = isAppTheme(storedTheme) ? storedTheme : DEFAULT_THEME

    document.documentElement.dataset.theme = initialTheme
    setActiveThemeState(initialTheme)
  }, [])

  const setActiveTheme = useCallback((theme: AppTheme) => {
    setActiveThemeState(theme)
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [])

  const value = useMemo(
    () => ({ activeTheme, setActiveTheme }),
    [activeTheme, setActiveTheme],
  )

  return <ActiveThemeContext.Provider value={value}>{children}</ActiveThemeContext.Provider>
}

export function useActiveTheme() {
  const context = useContext(ActiveThemeContext)

  if (!context) {
    throw new Error('useActiveTheme must be used within ActiveThemeProvider')
  }

  return context
}
