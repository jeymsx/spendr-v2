import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Report a bug: what a report is sent as, what goes with it, and what the
 * person sending it is told when it does not go.
 */

/** What the cloud answers the next insert with, and every row it was sent. */
let answer = /** @type {{message: string}|null} */ (null)
/** @type {any[]} */
let inserted = []

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      insert: async (/** @type {any} */ row) => { inserted.push(row); return { error: answer } },
    }),
  },
}))
vi.mock('./release', () => ({ APP_VERSION: '9.9.9' }))

const {
  feedbackRow, logForReport, describeDevice, deviceInfo, sendFeedback, replyLink, emailLink, MAX_MESSAGE,
} = await import('./feedback')

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** @param {Record<string, any>} [over] */
const crash = (over = {}) => ({
  at: '2026-10-09T01:00:00.000Z', last: '2026-10-09T01:05:00.000Z', count: 2, where: 'render',
  message: 'x is not defined', stack: Array.from({ length: 30 }, (_, i) => `at frame${i} (app.js:${i}:1)`).join('\n'),
  route: '/budget', version: '0.20.1', device: IPHONE, ...over,
})

beforeEach(() => { answer = null; inserted = [] })

describe('what a report is sent as', () => {
  const device = { layout: 'phone', installed: true, ua: IPHONE }

  it('is what was written, trimmed, with the version and the device', () => {
    const built = feedbackRow({ kind: 'idea', message: '  Dark mode for the PDF  \n', device })
    expect(built).toEqual({ row: { kind: 'idea', message: 'Dark mode for the PDF', app_version: '9.9.9', device, error_log: null } })
  })

  it('is refused when there is nothing in it, or too much', () => {
    expect(feedbackRow({ kind: 'bug', message: '   ', device })).toEqual({ error: 'Write something first.' })
    expect('error' in feedbackRow({ kind: 'bug', message: 'x'.repeat(MAX_MESSAGE + 1), device })).toBe(true)
    expect('row' in feedbackRow({ kind: 'bug', message: 'x'.repeat(MAX_MESSAGE), device })).toBe(true)
  })

  it('files a kind it does not know as other, rather than one the table would refuse', () => {
    const built = feedbackRow({ kind: 'rant', message: 'hi', device })
    expect('row' in built && built.row.kind).toBe('other')
  })

  it('takes the error log with a bug when it is left on - and never with an idea, or when it is turned off', () => {
    const crashes = [crash()]
    const withLog = feedbackRow({ kind: 'bug', message: 'Budget went blank', crashes, attachLog: true, device })
    expect('row' in withLog && withLog.row.error_log).toHaveLength(1)
    const off = feedbackRow({ kind: 'bug', message: 'Budget went blank', crashes, attachLog: false, device })
    expect('row' in off && off.row.error_log).toBeNull()
    const idea = feedbackRow({ kind: 'idea', message: 'More colours', crashes, attachLog: true, device })
    expect('row' in idea && idea.row.error_log).toBeNull()
  })
})

describe('the error log, as it goes with a report', () => {
  it('keeps each error and the first frames of its stack, not the whole of it, nor the device line', () => {
    const [e] = logForReport([crash()])
    expect(e).toMatchObject({ message: 'x is not defined', where: 'render', route: '/budget', version: '0.20.1', count: 2 })
    expect(e.stack.split('\n')).toHaveLength(8)
    expect('device' in e).toBe(false)
  })

  it('stays well inside what the table allows, however long the log', () => {
    const big = Array.from({ length: 40 }, () => crash({ message: 'm'.repeat(2000), stack: 's'.repeat(9000) }))
    const log = logForReport(big)
    expect(log).toHaveLength(20)
    expect(JSON.stringify(log).length).toBeLessThan(60000)
  })
})

describe('the device, in a few words', () => {
  it('names an iPhone opened from the Home Screen', () => {
    expect(describeDevice({ ua: IPHONE, installed: true, layout: 'phone' })).toBe('iPhone · Home Screen app')
  })

  it('names a computer, its browser and the layout', () => {
    expect(describeDevice({ ua: WINDOWS_CHROME, installed: false, layout: 'computer' })).toBe('Windows · Chrome · computer layout')
  })

  it('says nothing for a report with no device', () => {
    expect(describeDevice(null)).toBe('')
  })

  it('reads the layout, the Home Screen app and the screen from the browser', () => {
    const info = deviceInfo({
      doc: { documentElement: { classList: { contains: (/** @type {string} */ c) => c === 'web' } } },
      nav: { userAgent: WINDOWS_CHROME, language: 'en-PH' },
      win: { matchMedia: () => ({ matches: true }), screen: { width: 1920, height: 1080 } },
    })
    expect(info).toEqual({ layout: 'computer', installed: true, screen: '1920×1080', language: 'en-PH', ua: WINDOWS_CHROME })
  })
})

describe('sending', () => {
  it('inserts the row', async () => {
    await sendFeedback({ kind: 'bug', message: 'It froze', device: { ua: IPHONE } })
    expect(inserted).toEqual([{ kind: 'bug', message: 'It froze', app_version: '9.9.9', device: { ua: IPHONE }, error_log: null }])
  })

  it('says why in words when it does not go', async () => {
    answer = { message: 'feedback rate limit: ten an hour' }
    await expect(sendFeedback({ kind: 'bug', message: 'again', device: {} })).rejects.toThrow('a lot of reports in an hour')
    answer = { message: 'relation "public.feedback" does not exist' }
    await expect(sendFeedback({ kind: 'bug', message: 'again', device: {} })).rejects.toThrow('aren’t set up on the server yet')
    answer = { message: 'Failed to fetch' }
    await expect(sendFeedback({ kind: 'bug', message: 'again', device: {} })).rejects.toThrow('Check your connection')
  })

  it('sends nothing at all when there is nothing written', async () => {
    await expect(sendFeedback({ kind: 'bug', message: '', device: {} })).rejects.toThrow('Write something first.')
    expect(inserted).toEqual([])
  })
})

describe('answering', () => {
  it('replies by email to whoever sent it, with what they wrote quoted', () => {
    const link = replyLink(/** @type {any} */ ({ kind: 'bug', message: 'Line one\nLine two', sender_email: 'gen@example.com' }))
    expect(link?.startsWith('mailto:gen@example.com?subject=Your%20Spendr%20bug%20report')).toBe(true)
    expect(decodeURIComponent(String(link).split('body=')[1])).toBe('\n\n> Line one\n> Line two')
  })

  it('has no reply for a report with no address', () => {
    expect(replyLink(/** @type {any} */ ({ kind: 'idea', message: 'x', sender_email: null }))).toBeNull()
  })

  it('turns a report into an email for a device that cannot send it', () => {
    const link = emailLink({ kind: 'idea', message: ' More colours ' }, 'dev@example.com')
    expect(link.startsWith('mailto:dev@example.com?subject=Spendr%20idea%20%C2%B7%20v9.9.9')).toBe(true)
    expect(decodeURIComponent(link.split('body=')[1]).startsWith('More colours\n\n')).toBe(true)
  })
})
