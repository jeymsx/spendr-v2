// @vitest-environment jsdom
/**
 * Drag a sheet down to put it away - where it starts, and what a release does.
 *
 * jsdom has no layout, so every rect is zero and the distance to the bottom
 * edge is the window's height (768). The frame loop and the clock are faked
 * so a release plays out on demand. Pointer events are dispatched as
 * MouseEvents with pointer types, which is all the hook reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import Sheet from './Sheet'

let now = 0
let frames = []
function flush(max = 400) {
  for (let i = 0; i < max && frames.length; i++) {
    const cb = frames.shift()
    now += 16
    cb?.(now)
  }
}

beforeEach(() => {
  now = 0
  frames = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('web')
})

/** A pointer gesture: down at y0, moved through ys, up at the last. */
function drag(target, ys, { step = 16 } = {}) {
  const at = (type, y) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100, clientY: y })
    Object.defineProperty(e, 'pointerType', { value: 'touch' })
    Object.defineProperty(e, 'timeStamp', { value: now })
    return e
  }
  const panel = target.closest('[role="dialog"]')
  act(() => { target.dispatchEvent(at('pointerdown', ys[0])) })
  for (const y of ys.slice(1)) {
    now += step
    act(() => { panel.dispatchEvent(at('pointermove', y)) })
  }
  act(() => { panel.dispatchEvent(at('pointerup', ys.at(-1))) })
}

const sheet = (props = {}) => render(
  <Sheet open onClose={props.onClose ?? (() => {})} title="Transaction" {...props}>
    <p>body</p>
    <button type="button">Edit</button>
  </Sheet>,
)
const grab = (c) => c.querySelector('[data-sheet-grab]')
const panelOf = (c) => c.querySelector('[role="dialog"]')

describe('drag to dismiss', () => {
  it('follows the finger from the handle', () => {
    const { container } = sheet()
    const g = grab(container)
    const e = (type, y) => {
      const ev = new MouseEvent(type, { bubbles: true, clientX: 100, clientY: y })
      Object.defineProperty(ev, 'pointerType', { value: 'touch' })
      return ev
    }
    act(() => { g.dispatchEvent(e('pointerdown', 10)) })
    act(() => { panelOf(container).dispatchEvent(e('pointermove', 20)) }) // past the slop
    act(() => { panelOf(container).dispatchEvent(e('pointermove', 100)) })
    // 90px of travel less the 10px it took to become a drag. (jsdom keeps
    // `0 80px` as written; a browser normalises it to `0px 80px`.)
    expect(panelOf(container).style.translate).toMatch(/^0(px)? 80px$/)
  })

  it('a short slow drag springs back and stays open', () => {
    const onClose = vi.fn()
    const { container } = sheet({ onClose })
    drag(grab(container), [10, 20, 40, 60, 80], { step: 60 })
    flush()
    expect(onClose).not.toHaveBeenCalled()
    expect(panelOf(container).style.translate).toBe('')
  })

  it('a hard flick back up comes home without passing its rest', () => {
    // Past rest, a docked sheet would lift off the bottom edge and show the
    // page under it. The release speed is capped under the overshoot point.
    const onClose = vi.fn()
    const { container } = sheet({ onClose })
    const panel = panelOf(container)
    // Down 100px, then thrown back up at ~1300px/s, at 60 frames a second.
    drag(grab(container), [10, 20, 120, 115, 100, 80, 60, 40], { step: 16 })
    const ys = []
    for (let i = 0; i < 200 && frames.length; i++) {
      const cb = frames.shift(); now += 16; cb?.(now)
      const m = /(-?[\d.]+)px$/.exec(panel.style.translate)
      ys.push(m ? Number(m[1]) : 0)
    }
    expect(onClose).not.toHaveBeenCalled()
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(panel.style.translate).toBe('')
  })

  it('a drag past a third of the way closes it', () => {
    const onClose = vi.fn()
    const { container } = sheet({ onClose })
    drag(grab(container), [10, 20, 120, 220, 330], { step: 60 })
    flush()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a quick flick closes it from a short distance', () => {
    const onClose = vi.fn()
    const { container } = sheet({ onClose })
    drag(grab(container), [10, 20, 45, 70], { step: 12 })
    flush()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stretches but will not go while it cannot be dismissed', () => {
    // A save in flight: the sheet must not vanish from under the write.
    const onClose = vi.fn()
    const { container } = sheet({ onClose, dismissible: false })
    drag(grab(container), [10, 20, 200, 400], { step: 12 })
    flush()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not take a drag from the body of a docked sheet - that is a scroll', () => {
    const onClose = vi.fn()
    // maxHeight docks it: a sheet with a height of its own is one that scrolls.
    const { container, getByText } = sheet({ onClose, maxHeight: '52dvh' })
    drag(getByText('body'), [10, 20, 200, 400], { step: 12 })
    flush()
    expect(onClose).not.toHaveBeenCalled()
    expect(panelOf(container).style.translate).toBe('')
  })

  it('takes a drag from anywhere on a floating sheet', () => {
    const onClose = vi.fn()
    const { getByText } = sheet({ onClose })
    drag(getByText('body'), [10, 20, 200, 400], { step: 12 })
    flush()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('swallows the click a drag ends on', () => {
    const onEdit = vi.fn()
    const { container, getByText } = render(
      <Sheet open onClose={() => {}} title="Transaction">
        <button type="button" onClick={onEdit}>Edit</button>
      </Sheet>,
    )
    drag(getByText('Edit'), [10, 20, 40, 60], { step: 60 })
    act(() => { getByText('Edit').click() })
    expect(onEdit).not.toHaveBeenCalled()
    flush()
    expect(panelOf(container)).toBeTruthy()
  })

  it('leaves a control that owns its touches alone - the swipe to confirm', () => {
    const onClose = vi.fn()
    const { container, getByText } = render(
      <Sheet open onClose={onClose} title="Delete?">
        <div style={{ touchAction: 'none' }}><span>Swipe to delete</span></div>
      </Sheet>,
    )
    // Starts downward before it goes sideways: still the swipe's, not ours.
    drag(getByText('Swipe to delete'), [10, 20, 200, 400], { step: 12 })
    flush()
    expect(onClose).not.toHaveBeenCalled()
    expect(panelOf(container).style.translate).toBe('')
  })

  it('leaves a tap alone', () => {
    const onEdit = vi.fn()
    const { getByText } = render(
      <Sheet open onClose={() => {}} title="Transaction">
        <button type="button" onClick={onEdit}>Edit</button>
      </Sheet>,
    )
    act(() => { getByText('Edit').click() })
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('is off on desktop, where the sheet is a centred modal', () => {
    document.documentElement.classList.add('web')
    const onClose = vi.fn()
    const { container } = sheet({ onClose })
    drag(grab(container), [10, 20, 200, 400], { step: 12 })
    flush()
    expect(onClose).not.toHaveBeenCalled()
    expect(panelOf(container).style.translate).toBe('')
  })
})
