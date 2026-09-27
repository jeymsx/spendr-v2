// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * The share sheet, and the summary's four looks on it.
 *
 * jsdom has no canvas and no layout, so the pictures are stand-ins and the
 * rail never really scrolls. What it can answer is the rest: which pictures
 * are drawn, in what order and one at a time; which look is chosen and
 * remembered; what the saved file is called; and that every preview's blob
 * URL is let go. The swipe itself is checked in a real browser.
 */

/** Every picture asked for, as "look" or "look-hidden", in order. */
let asked = []
/** The blob each look was last drawn as. */
let blobs = {}
let inFlight = 0
let mostAtOnce = 0

vi.mock('./pictures', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    renderPicture: vi.fn(async ({ id, look, hideAmounts }) => {
      inFlight++
      mostAtOnce = Math.max(mostAtOnce, inFlight)
      asked.push(`${id === 'summary' ? look : id}${hideAmounts ? '-hidden' : ''}`)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      const blob = new Blob([`${look}${hideAmounts ? '-hidden' : ''}`], { type: 'image/png' })
      blobs[look] = blob
      return blob
    }),
  }
})
vi.mock('../../lib/share', () => ({
  canSendFiles: () => false,
  saveFile: vi.fn(async () => 'downloaded'),
  sendFile: vi.fn(async () => 'shared'),
}))
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: () => {}, dismiss: () => {} }) }))
vi.mock('../../hooks/useScrollLock', () => ({ useScrollLock: () => {} }))

const { default: ShareSheet } = await import('./ShareSheet')
const { pictureName, SUMMARY_LOOKS } = await import('./pictures')
const { saveFile } = await import('../../lib/share')

let urls = 0
const made = []
const revoked = []

beforeEach(() => {
  asked = []
  blobs = {}
  inFlight = 0
  mostAtOnce = 0
  made.length = 0
  revoked.length = 0
  localStorage.clear()
  URL.createObjectURL = vi.fn(() => { const u = `blob:test/${++urls}`; made.push(u); return u })
  URL.revokeObjectURL = vi.fn(u => { revoked.push(u) })
  // jsdom lays nothing out and scrolls nothing; the rail only needs to be told where to go.
  window.HTMLElement.prototype.scrollTo = function scrollTo(o) { this.scrollLeft = o?.left ?? 0 }
  vi.mocked(saveFile).mockClear()
})
afterEach(cleanup)

const recap = /** @type {any} */ ({ month: '2026-09' })
const pal = /** @type {any} */ ({ accent: '#2D9DFF', tones: [{}] })

/** @param {Record<string, any>} [props] */
function sheet(props = {}) {
  const all = { open: true, onClose: () => {}, id: 'summary', recap, currency: 'PHP', pal, name: 'Ana', ...props }
  const r = render(<ShareSheet {...all} />)
  return { ...r, again: (/** @type {Record<string, any>} */ more) => r.rerender(<ShareSheet {...all} {...more} />) }
}

const radios = () => screen.getAllByRole('radio')
const chosen = () => radios().find(r => r.getAttribute('aria-checked') === 'true')?.getAttribute('aria-label')
const saveButton = () => /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Save image' }))

describe('the summary, four ways', () => {
  it('is a radio group of the four looks, in order', () => {
    sheet()
    expect(screen.getByRole('radiogroup', { name: 'Design' })).toBeTruthy()
    expect(radios().map(r => r.getAttribute('aria-label'))).toEqual(['Colour', 'Dark', 'Light', 'Lights out'])
    expect(SUMMARY_LOOKS.map(l => l.name)).toEqual(['Colour', 'Dark', 'Light', 'Lights out'])
  })

  it('starts on Colour, and only the chosen look is in the tab order', () => {
    sheet()
    expect(chosen()).toBe('Colour')
    expect(radios().map(r => r.tabIndex)).toEqual([0, -1, -1, -1])
  })

  it('draws the look on show first, then the other three - one at a time', async () => {
    localStorage.setItem('wrappedLook', 'light')
    sheet()
    expect(chosen()).toBe('Light')
    await waitFor(() => expect(asked).toEqual(['light', 'colour', 'dark', 'lightsout']))
    expect(mostAtOnce).toBe(1)
  })

  it('keys choose a look, and it is remembered', async () => {
    sheet()
    fireEvent.keyDown(radios()[0], { key: 'ArrowRight' })
    expect(chosen()).toBe('Dark')
    expect(localStorage.getItem('wrappedLook')).toBe('dark')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Dark')
    fireEvent.keyDown(radios()[1], { key: 'End' })
    expect(chosen()).toBe('Lights out')
    fireEvent.keyDown(radios()[3], { key: 'ArrowRight' })
    expect(chosen()).toBe('Lights out')
    fireEvent.keyDown(radios()[3], { key: 'Home' })
    expect(chosen()).toBe('Colour')
    fireEvent.keyDown(radios()[0], { key: 'ArrowLeft' })
    expect(chosen()).toBe('Colour')
  })

  it('a tap on a look chooses it', () => {
    sheet()
    fireEvent.click(radios()[2])
    expect(chosen()).toBe('Light')
    expect(localStorage.getItem('wrappedLook')).toBe('light')
  })

  it('saves the chosen look, under its own name', async () => {
    localStorage.setItem('wrappedLook', 'lightsout')
    sheet()
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1))
    const [blob, file] = vi.mocked(saveFile).mock.calls[0]
    expect(file).toBe('spendr-wrapped-2026-09-lightsout.png')
    expect(blob).toBe(blobs.lightsout)
  })

  it('waits for the chosen look, not just any look, before it can be saved', async () => {
    sheet()
    await waitFor(() => expect(asked.length).toBe(4))
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    fireEvent.click(screen.getByRole('switch', { name: 'Hide amounts' }))
    // Every picture is out of date the moment the switch moves.
    expect(saveButton().disabled).toBe(true)
  })

  it('hiding the amounts draws all four again, the one on show first, and lets the old ones go', async () => {
    localStorage.setItem('wrappedLook', 'dark')
    sheet()
    await waitFor(() => expect(asked.length).toBe(4))
    await waitFor(() => expect(made.length).toBe(4))
    const before = [...made]
    fireEvent.click(screen.getByRole('switch', { name: 'Hide amounts' }))
    await waitFor(() => expect(asked.slice(4)).toEqual(['dark-hidden', 'colour-hidden', 'light-hidden', 'lightsout-hidden']))
    await waitFor(() => expect(revoked).toEqual(expect.arrayContaining(before)))
    expect(localStorage.getItem('wrappedHideAmounts')).toBe('1')
  })

  it('opening it again draws nothing new', async () => {
    const { again } = sheet()
    await waitFor(() => expect(asked.length).toBe(4))
    await waitFor(() => expect(made.length).toBe(4))
    again({ open: false })
    again({ open: true })
    await new Promise(r => setTimeout(r, 40))
    expect(asked.length).toBe(4)
  })

  it('lets every preview go when it goes', async () => {
    const { unmount } = sheet()
    await waitFor(() => expect(made.length).toBe(4))
    unmount()
    expect(revoked).toEqual(expect.arrayContaining(made))
  })
})

describe('any other slide', () => {
  it('has its one picture and no rail', async () => {
    sheet({ id: 'spent' })
    expect(screen.queryByRole('radiogroup')).toBe(null)
    await waitFor(() => expect(saveButton().disabled).toBe(false))
    expect(asked).toEqual(['spent'])
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1))
    expect(vi.mocked(saveFile).mock.calls[0][1]).toBe('spendr-wrapped-2026-09-spent.png')
  })
})

describe('pictureName', () => {
  it('names the summary by its look, colour as it always was', () => {
    expect(pictureName('2026-09')).toBe('spendr-wrapped-2026-09.png')
    expect(pictureName('2026-09', 'summary', 'colour')).toBe('spendr-wrapped-2026-09.png')
    expect(pictureName('2026-09', 'summary', 'dark')).toBe('spendr-wrapped-2026-09-dark.png')
    expect(pictureName('2026-09', 'summary', 'lightsout')).toBe('spendr-wrapped-2026-09-lightsout.png')
  })

  it('names any other slide by the slide, whatever the look', () => {
    expect(pictureName('2026-09', 'spent')).toBe('spendr-wrapped-2026-09-spent.png')
    expect(pictureName('2026-09', 'spent', 'dark')).toBe('spendr-wrapped-2026-09-spent.png')
  })
})
