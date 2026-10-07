import { describe, it, expect } from 'vitest'
import { DEFAULT_TREND_SETTINGS, readTrendSettings } from './trendSettings'

describe('readTrendSettings', () => {
  it('is a line chart of spending, curved, by day then month, with no dots and no average, until it is set', () => {
    expect(readTrendSettings(undefined)).toEqual(DEFAULT_TREND_SETTINGS)
    expect(DEFAULT_TREND_SETTINGS).toEqual({ chart: 'line', series: ['expenses'], grain: 'auto', smooth: true, points: false, average: false })
  })

  it('keeps what is valid', () => {
    const s = { chart: 'bars', series: ['income', 'netflow'], grain: 'week', smooth: false, points: true, average: true }
    expect(readTrendSettings(s)).toEqual(s)
  })

  it('puts back to its default anything missing, unknown or of the wrong kind', () => {
    expect(readTrendSettings({ chart: 'pie', series: 'both', grain: 'decade', smooth: 'yes', points: 1, average: null }))
      .toEqual(DEFAULT_TREND_SETTINGS)
    expect(readTrendSettings({ chart: 'area' })).toEqual({ ...DEFAULT_TREND_SETTINGS, chart: 'area' })
  })

  it('reads anything that is not an object as nothing at all', () => {
    for (const bad of /** @type {unknown[]} */ ([null, 'line', 7, [], true])) expect(readTrendSettings(bad)).toEqual(DEFAULT_TREND_SETTINGS)
  })

  describe('series', () => {
    it('still reads the single name an earlier version stored', () => {
      expect(readTrendSettings({ series: 'netflow' }).series).toEqual(['netflow'])
    })

    it('keeps the canonical order, whatever order they were picked in, and each once', () => {
      expect(readTrendSettings({ series: ['netflow', 'expenses', 'netflow'] }).series).toEqual(['expenses', 'netflow'])
    })

    it('drops what is unknown, and never ends up with no line at all', () => {
      expect(readTrendSettings({ series: ['income', 'bogus'] }).series).toEqual(['income'])
      expect(readTrendSettings({ series: [] }).series).toEqual(['expenses'])
      expect(readTrendSettings({ series: ['bogus'] }).series).toEqual(['expenses'])
    })
  })

  it('gives back a list of its own each time, so one caller cannot change the default', () => {
    const a = readTrendSettings(undefined)
    a.series.push('income')
    expect(readTrendSettings(undefined).series).toEqual(['expenses'])
  })
})
