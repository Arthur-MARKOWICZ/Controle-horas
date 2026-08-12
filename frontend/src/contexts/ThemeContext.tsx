import { createContext, useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

type Theme = 'light' | 'dark'
export interface ThemeContextValue { theme: Theme; isDark: boolean; setTheme: Dispatch<SetStateAction<Theme>>; toggleTheme: () => void }
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
const THEME_STORAGE_KEY = 'theme'
const getInitialTheme = (): Theme => typeof window !== 'undefined' && localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_STORAGE_KEY, theme) }, [theme])
  const toggleTheme = useCallback(() => setTheme((current) => current === 'dark' ? 'light' : 'dark'), [])
  const value = useMemo(() => ({ theme, isDark: theme === 'dark', setTheme, toggleTheme }), [theme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
export default ThemeContext
