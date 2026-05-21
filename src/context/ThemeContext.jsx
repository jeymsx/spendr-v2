import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const DEFAULT_ACCENT = '#2D9DFF'

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function applyAccent(color) {
  const [r, g, b] = hexToRgb(color)
  document.documentElement.style.setProperty('--color-primary', color)
  document.documentElement.style.setProperty('--color-primary-rgb', `${r}, ${g}, ${b}`)
  const root = document.documentElement
  if (color === '#2D9DFF') {
    root.classList.remove('accent-custom')
    root.classList.add('accent-blue')
  } else {
    root.classList.remove('accent-blue')
    root.classList.add('accent-custom')
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('spendr-theme') ||
        (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    } catch {
      return 'light'
    }
  })

  const [accentColor, setAccentColorState] = useState(() => {
    try {
      return localStorage.getItem('accentColor') || DEFAULT_ACCENT
    } catch {
      return DEFAULT_ACCENT
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    try {
      localStorage.setItem('spendr-theme', theme)
    } catch {
      // storage unavailable
    }
  }, [theme])

  useEffect(() => {
    applyAccent(accentColor)
    try {
      localStorage.setItem('accentColor', accentColor)
    } catch {
      // storage unavailable
    }
  }, [accentColor])

  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))
  const setAccentColor = (color) => setAccentColorState(color)

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
