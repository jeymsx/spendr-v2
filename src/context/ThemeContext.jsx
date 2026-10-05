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

/**
 * The text that goes on the accent: white, unless the accent is so light
 * that white on it falls under 2.5:1 - Honey, Amber, Sage, Lagoon - when it
 * is the app's ink instead. Not the higher of the two every time: Azure
 * reads 2.9:1 against white and 6:1 against ink, and Spendr's blue button
 * has always been white on blue. The threshold keeps that, and turns the
 * pale accents that were genuinely hard to read.
 *
 * @param {[number, number, number]} rgb
 */
export function onAccent([r, g, b]) {
  const lin = (/** @type {number} */ c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return 1.05 / (L + 0.05) >= 2.5 ? '#ffffff' : '#0f172a'
}

function applyAccent(color) {
  const [r, g, b] = hexToRgb(color)
  document.documentElement.style.setProperty('--color-primary', color)
  document.documentElement.style.setProperty('--color-primary-rgb', `${r}, ${g}, ${b}`)
  document.documentElement.style.setProperty('--color-on-primary', onAccent([r, g, b]))
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
      return localStorage.getItem('spendr-theme') || 'dark'
    } catch {
      return 'light'
    }
  })

  /* 'vivid' is the app as it has always looked: the accent washing the
     background, tinted glass cards. 'flat' is the clean one - neutral flat
     surfaces and hairlines, iOS and shadcn rather than Spendr's own glow -
     and in dark mode it goes to true black: lights out. Orthogonal to the
     theme, so either works in light and dark. See `html.flat` in index.css. */
  const [style, setStyleState] = useState(() => {
    try {
      return localStorage.getItem('spendr-style') === 'flat' ? 'flat' : 'vivid'
    } catch {
      return 'vivid'
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
    document.documentElement.classList.toggle('flat', style === 'flat')
    try {
      localStorage.setItem('spendr-style', style)
    } catch {
      // storage unavailable
    }
  }, [style])

  /* The status bar, which the page cannot paint: true black under lights
     out, the app's own near-black otherwise - what index.html ships. */
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' && style === 'flat' ? '#000000' : '#0b0f14')
    /* And the page's own ground, which index.html set inline before the app
       loaded - inline, it outranks the stylesheet, so it has to follow a
       change here or the edges of an overscroll show the old colour. */
    const flat = style === 'flat'
    document.documentElement.style.background = theme === 'dark'
      ? (flat ? '#000000' : '#0b0f14')
      : (flat ? '#f2f2f7' : '#f8fafc')
  }, [theme, style])

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
  const setStyle = (next) => setStyleState(next === 'flat' ? 'flat' : 'vivid')

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, style, setStyle, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

/** Whether the app is dark - false outside a ThemeProvider, for leaf pictures rendered alone (tests, previews). */
export const useIsDark = () => useContext(ThemeContext)?.theme === 'dark'
