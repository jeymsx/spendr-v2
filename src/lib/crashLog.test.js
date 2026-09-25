// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { MAX_ENTRIES, clearCrashes, crashReport, readCrashes, recordCrash } from './crashLog'

/**
 * The on-device error log.
 *
 * Its one hard rule is that it must never throw - it runs inside error
 * handlers, and an exception from here would replace the report of the real
 * problem with a report of this.
 */

beforeEach(() => clearCrashes())

describe('recording', () => {
  it('keeps the message, where it happened and the version', () => {
    recordCrash(new Error('Cannot read balance of undefined'), 'render', { version: '0.4.0' })
    const [e] = readCrashes()
    expect(e.message).toBe('Cannot read balance of undefined')
    expect(e.where).toBe('render')
    expect(e.version).toBe('0.4.0')
    expect(e.count).toBe(1)
    expect(e.device.length).toBeGreaterThan(0)
  })

  it('takes a string or a thrown object as readily as an Error', () => {
    recordCrash('quota exceeded', 'promise')
    recordCrash({ code: 22 }, 'promise')
    expect(readCrashes().map(e => e.message)).toEqual(['{"code":22}', 'quota exceeded'])
  })

  it('keeps the newest first', () => {
    recordCrash(new Error('first'), 'error')
    recordCrash(new Error('second'), 'error')
    expect(readCrashes().map(e => e.message)).toEqual(['second', 'first'])
  })
})

describe('not flooding', () => {
  /* A render loop throws the same error hundreds of times. Twenty copies of
     one fault would push every other report out of the log. */
  it('folds a repeating error into one entry with a count', () => {
    for (let i = 0; i < 50; i++) recordCrash(new Error('loop'), 'render')
    const log = readCrashes()
    expect(log).toHaveLength(1)
    expect(log[0].count).toBe(50)
  })

  it('caps the log at its limit', () => {
    for (let i = 0; i < MAX_ENTRIES + 15; i++) recordCrash(new Error(`e${i}`), 'error')
    expect(readCrashes()).toHaveLength(MAX_ENTRIES)
    expect(readCrashes()[0].message).toBe(`e${MAX_ENTRIES + 14}`)
  })

  it('ignores browser noise that is not a crash', () => {
    recordCrash(new Error('ResizeObserver loop completed with undelivered notifications.'), 'error')
    recordCrash('Script error.', 'error')
    expect(readCrashes()).toEqual([])
  })
})

describe('never throwing', () => {
  it('survives storage that refuses to be read', () => {
    localStorage.setItem('spendr-crash-log', '{not json')
    expect(() => readCrashes()).not.toThrow()
    expect(readCrashes()).toEqual([])
    expect(() => recordCrash(new Error('after corruption'), 'error')).not.toThrow()
  })

  it('survives something that is not an error at all', () => {
    expect(() => recordCrash(undefined, 'error')).not.toThrow()
    expect(() => recordCrash(null, 'promise')).not.toThrow()
  })
})

describe('the report', () => {
  it('reads as plain text a person can paste into a chat', () => {
    recordCrash(new Error('Balance went missing'), 'render', { version: '0.4.0' })
    const text = crashReport(readCrashes())
    expect(text).toMatch(/^Spendr error report - 1 error/)
    expect(text).toContain('Balance went missing')
    expect(text).toContain('v0.4.0')
  })

  it('says so when there is nothing to report', () => {
    expect(crashReport([])).toBe('No errors recorded.')
  })
})
