// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

/**
 * NotificationSync's toast for budget alerts.
 *
 * It called showToast once per fresh alert in a loop, and the phone shows one
 * toast at a time, so a pass that found several showed only the last. They are
 * one toast now: one alert keeps its title, several are said together.
 *
 * Everything the component reads is stood in for, and `recordNotifications`
 * hands back the alerts the pass "found".
 */

const NOW = new Date(2026, 8, 20, 12, 0, 0)

/** @param {string} category @param {'budget-warn'|'budget-over'} kind */
const alert = (category, kind) => ({
  id: `budget:${category}:2026-09:${kind}`, kind, category, url: '/budget', body: '',
  at: new Date(NOW.getTime() - 1000).toISOString(),
  title: kind === 'budget-over' ? `Over your ${category} budget` : `${category} budget 80% used`,
})

/** @type {{ fresh: any[] }} */
const found = { fresh: [] }
const showToast = vi.fn()

vi.mock('../db/db', () => ({ default: {}, UNSYNCED: 0, SYNCED: 1, SYNCED_TABLES: [] }))
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: (/** @type {any[]} */ ...a) => showToast(...a) }) }))
// Every read is already there: an empty ledger, which is all the pass needs to run.
vi.mock('../hooks/useLiveQuery', () => ({ useLiveQuery: (/** @type {any} */ _q, /** @type {any} */ _d, /** @type {any} */ initial) => (initial === undefined ? [] : initial) }))
vi.mock('../hooks/useForecast', () => ({ default: () => ({ forecast: { events: [] } }) }))
vi.mock('./WhatsNewModal', () => ({ CURRENT_VERSION: '0.0.0', WHATS_NEW_HEADLINE: '' }))
vi.mock('../lib/backup', () => ({ LAST_BACKUP_KEY: 'lastBackup' }))
vi.mock('../db/notifications', () => ({
  releaseSeenAt: async () => null,
  recordNotifications: async () => found.fresh,
}))
// The pass's candidates are beside the point; what it recorded is what matters.
vi.mock('../lib/notifications', async (importOriginal) => ({
  ...(await importOriginal()),
  collectNotifications: () => [],
}))

const { default: NotificationSync } = await import('./NotificationSync')

/** Mount, let the settle timer fire, and let the async pass finish. */
async function runPass() {
  render(<NotificationSync />)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  showToast.mockClear()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('the toast for fresh budget alerts', () => {
  it('shows one alert under its own title', async () => {
    found.fresh = [alert('Food', 'budget-warn')]
    await runPass()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Food budget 80% used', 'warning', { ifIdle: true })
  })

  /** The bug: two calls, and only the second was ever on screen. */
  it('shows several as one toast, not one each', async () => {
    found.fresh = [alert('Food', 'budget-warn'), alert('Transport', 'budget-warn')]
    await runPass()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Food and Transport are near their limits', 'warning', { ifIdle: true })
  })

  it('counts them from three', async () => {
    found.fresh = [alert('Food', 'budget-warn'), alert('Transport', 'budget-warn'), alert('Fun', 'budget-over')]
    await runPass()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast.mock.calls[0][0]).toBe('3 budgets need a look')
  })

  it('is silent when nothing budget-related is fresh', async () => {
    found.fresh = [{ id: 'bill:x', kind: 'bill-due', title: 'Rent due today', body: '', url: null, at: NOW.toISOString() }]
    await runPass()
    expect(showToast).not.toHaveBeenCalled()
  })
})
