import { describe, it, expect } from 'vitest'
import pkg from '../../package.json'
import { APP_VERSION, RELEASE_DATE, RELEASE_NOTES } from './release'
import { CHANGELOG } from './changelog'

/** [0, 6, 0] from '0.6.0'. @param {string} v */
const parts = (v) => v.split('.').map(Number)
/** Positive when a is newer. @param {string} a @param {string} b */
const cmp = (a, b) => {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

describe('the version', () => {
  it('is package.json’s, everywhere', () => {
    expect(APP_VERSION).toBe(pkg.version)
    expect(CHANGELOG[0].version).toBe(APP_VERSION)
    expect(CHANGELOG[0].date).toBe(RELEASE_DATE)
  })

  it('tells What’s New and the changelog the same story', () => {
    expect(CHANGELOG[0].items.map(i => i.title)).toEqual(RELEASE_NOTES.map(n => n.title))
  })
})

describe('the changelog', () => {
  it('runs newest first, by version and by date', () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(cmp(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0)
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true)
    }
  })

  it('says a few things per release, each with a title and a sentence', () => {
    for (const r of CHANGELOG) {
      expect(r.items.length).toBeGreaterThan(0)
      expect(r.items.length).toBeLessThanOrEqual(8)
      for (const item of r.items) {
        expect(item.title.trim().length, r.version).toBeGreaterThan(0)
        expect(item.desc.trim().length, item.title).toBeGreaterThan(0)
        // The app's copy rule: no em dashes in anything a person reads.
        expect(`${item.title} ${item.desc}`, item.title).not.toMatch(/—/)
      }
    }
  })
})
