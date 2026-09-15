export const THEME_STORAGE_KEY = 'hoardcore-theme'
export const DEFAULT_THEME = 'nlan'

export const THEMES = [
  {
    name: 'NLAN',
    value: 'nlan',
    source: 'https://tweakcn.com/r/themes/cmli80zt6000004l757xqgizs',
  },
  {
    name: 'Cyberpunk',
    value: 'cyberpunk',
    source: 'https://tweakcn.com/r/themes/cmopxyb0d000204l1g6iuhf8m',
  },
] as const

export type AppTheme = (typeof THEMES)[number]['value']

export function isAppTheme(value: string | null): value is AppTheme {
  return THEMES.some((theme) => theme.value === value)
}

export const THEME_BOOTSTRAP_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='nlan'||t==='cyberpunk'){document.documentElement.dataset.theme=t}}catch(e){}`
