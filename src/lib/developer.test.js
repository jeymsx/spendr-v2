import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEVELOPER_EMAIL, deviceIsDeveloper, isDeveloper, rememberDeveloper } from './developer'

/** A localStorage that holds what it is given. */
function stubStorage() {
  /** @type {Record<string, string>} */
  const kept = {}
  vi.stubGlobal('localStorage', {
    getItem: (/** @type {string} */ k) => (k in kept ? kept[k] : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { kept[k] = String(v) },
    removeItem: (/** @type {string} */ k) => { delete kept[k] },
  })
  return kept
}

describe('who the developer-only screens are for', () => {
  beforeEach(() => { vi.unstubAllGlobals(); stubStorage() })

  it('is the developer\'s own address, however it is cased', () => {
    expect(isDeveloper(DEVELOPER_EMAIL)).toBe(true)
    expect(isDeveloper(DEVELOPER_EMAIL.toUpperCase())).toBe(true)
    expect(isDeveloper(`  ${DEVELOPER_EMAIL} `)).toBe(true)
  })

  it('is nobody else\'s, even on a device that has seen the developer', () => {
    rememberDeveloper(DEVELOPER_EMAIL)
    expect(isDeveloper('brother@gmail.com')).toBe(false)
    expect(isDeveloper('sablayjames@gmail.com.au')).toBe(false)
  })

  it('goes by the device when there is no account to ask', () => {
    expect(isDeveloper(null)).toBe(false)
    expect(isDeveloper(undefined)).toBe(false)
    rememberDeveloper(DEVELOPER_EMAIL)
    expect(deviceIsDeveloper()).toBe(true)
    expect(isDeveloper(null)).toBe(true)
  })

  it('remembers only the developer\'s address', () => {
    rememberDeveloper('someone@example.com')
    rememberDeveloper(null)
    expect(deviceIsDeveloper()).toBe(false)
  })

  it('keeps working with storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('off') }, setItem: () => { throw new Error('off') } })
    expect(() => rememberDeveloper(DEVELOPER_EMAIL)).not.toThrow()
    expect(deviceIsDeveloper()).toBe(false)
    expect(isDeveloper(DEVELOPER_EMAIL)).toBe(true)
  })
})
