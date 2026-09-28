/**
 * What the site knows about the app, read from the app's own modules at build
 * time. Nothing here is typed out a second time: the changelog, the policy
 * text, the achievements and the bank list are the app's, so the site says
 * what the app does and cannot drift from it.
 */
// @ts-ignore - the app's modules are JS with JSDoc
import { CHANGELOG } from '../../../src/lib/changelog.js'
// @ts-ignore
import { APP_VERSION, RELEASE_DATE, RELEASE_NOTES } from '../../../src/lib/release.js'
// @ts-ignore
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '../../../src/lib/policy.js'
// @ts-ignore
import { ACHIEVEMENTS, achievementArt } from '../../../src/lib/achievements.js'
// @ts-ignore
import { CHALLENGES } from '../../../src/lib/challenges.js'
// @ts-ignore
import { toneHue, TRACKS, tierKey, tierLabel } from '../../../src/lib/achievements.js'
// @ts-ignore
import { PH_ACCOUNTS, PH_HOLDINGS } from '../../../src/lib/phAccounts.js'

export interface ChangelogItem { title: string; desc: string }
export interface Release { version: string; date: string; items: ChangelogItem[] }
export interface ReleaseNote { icon: string; title: string; desc: string }
export interface PolicySection { h: string | null; b: string }
export interface Achievement {
  key: string
  kind: 'badge' | 'milestone'
  name: string
  blurb: string
  tone: string
  glyph: string
  track?: string
  level?: string
}
export interface Art { glyph: string; hue: string; shape: 'hex' | 'circle'; level?: string }

export const version: string = APP_VERSION
export const releaseDate: string = RELEASE_DATE
export const releaseNotes: ReleaseNote[] = RELEASE_NOTES
export const changelog: Release[] = CHANGELOG
export const privacy: PolicySection[] = PRIVACY_SECTIONS
export const terms: PolicySection[] = TERMS_SECTIONS
export const achievements: Achievement[] = ACHIEVEMENTS
export const artFor = (key: string): Art | null => achievementArt(key)

/** Banks and e-wallets the app has a preset for, and investments and loans. */
export const banks: { name: string; group?: string; popular?: boolean }[] = PH_ACCOUNTS
export const holdings: { name: string }[] = PH_HOLDINGS

/** Badges, and the first level of every milestone track. */
export const badges = achievements.filter(a => a.kind === 'badge')
export const milestones = achievements.filter(a => a.kind === 'milestone')
export const firstLevels = milestones.filter((a, i, all) => all.findIndex(b => b.track === a.track) === i)
/** Every level of one track, in order: the logging streak's 3, 7, 14, 30… */
export const levelsOf = (track: string) => milestones.filter(a => a.track === track)

export interface Challenge { key: string; name: string; blurb: string; length: string; glyph: string; tone: string }
export const challenges: Challenge[] = CHALLENGES.map((c: Challenge) => ({
  key: c.key, name: c.name, blurb: c.blurb, length: c.length, glyph: c.glyph, tone: c.tone,
}))
export const hueOf = (tone: string): string => toneHue(tone)

/** The milestone tracks, each with its levels in order. */
export interface Track { key: string; name: string; about: string; glyph: string; tone: string; levels: { key: string; label: string }[] }
export const tracks: Track[] = TRACKS.map((t: any) => ({
  key: t.key, name: t.name, about: t.about, glyph: t.glyph, tone: t.tone,
  levels: t.tiers.map((tier: any) => ({ key: tierKey(t, tier), label: tierLabel(tier) })),
}))

/** "28 September 2026" from '2026-09-28', read as a date rather than a moment. */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/** The part of a policy body that is an email address, so it can be a link. */
export function splitEmail(text: string): [string, string | null, string] {
  const m = text.match(/[\w.-]+@[\w.-]+\.\w+/)
  if (!m || m.index == null) return [text, null, '']
  return [text.slice(0, m.index), m[0], text.slice(m.index + m[0].length)]
}

/**
 * The accent colours in Settings. Mirrors ACCENT_COLORS in
 * src/pages/settings/shared.jsx, which is a React module the site cannot load.
 */
export const accents = [
  { hex: '#2D9DFF', name: 'Azure' },
  { hex: '#845EF7', name: 'Cosmos' },
  { hex: '#F06595', name: 'Blush' },
  { hex: '#51CF66', name: 'Sage' },
  { hex: '#20C997', name: 'Lagoon' },
  { hex: '#FFB347', name: 'Amber' },
  { hex: '#FF6B6B', name: 'Ember' },
  { hex: '#FCC419', name: 'Honey' },
]
