import type { ImageMetadata } from 'astro'

/**
 * The app's screens, captured from the real app with the demo ledger: an
 * iPhone 15 Pro at 3x with its safe areas, and the desktop layout at 1440.
 * Most come in a dark and a light capture, and the site shows whichever
 * matches its theme. Wrapped is the same in both, so it has only one.
 */
const files = import.meta.glob<{ default: ImageMetadata }>('../assets/screens/*.webp', { eager: true })

export interface ScreenPair { dark?: ImageMetadata; light?: ImageMetadata }

export const screens: Record<string, ScreenPair> = {}
for (const [path, mod] of Object.entries(files)) {
  const m = path.match(/([\w-]+)-(dark|light)\.webp$/)
  if (!m) continue
  const [, name, theme] = m
  ;(screens[name] ??= {})[theme as 'dark' | 'light'] = mod.default
}

export function screen(name: string): ScreenPair {
  const s = screens[name]
  if (!s) throw new Error(`No capture called "${name}" in src/assets/screens`)
  return s
}
