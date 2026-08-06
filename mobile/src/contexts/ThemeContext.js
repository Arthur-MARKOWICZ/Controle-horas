import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { darkTheme, lightTheme } from '../styles/theme'

const ThemeContext = createContext(null)
const THEME_KEY = 'controle_horas_theme'

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => { AsyncStorage.getItem(THEME_KEY).then((value) => setIsDark(value === 'dark')) }, [])
  const value = useMemo(() => ({
    isDark, theme: isDark ? darkTheme : lightTheme,
    toggleTheme: () => setIsDark((value) => { const next = !value; AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light'); return next }),
  }), [isDark])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() { const context = useContext(ThemeContext); if (!context) throw new Error('useTheme must be used within ThemeProvider'); return context }
