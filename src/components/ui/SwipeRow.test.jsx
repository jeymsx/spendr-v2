// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import SwipeRow from './SwipeRow'

/**
 * Drag left to delete. jsdom lays nothing out, so every row here is given a
 * width, and runs with motion reduced so each release lands at once rather
 * than on a spring - what is asked is where a release ends up, not how it
 * gets there.
 */

// jsdom has no PointerEvent; a MouseEvent with a pointer id is all this needs.
class FakePointer extends MouseEvent {
  /** @param {string} type @param {Record<string, any>} [init] */
  constructor(type, init = {}) {
    super(type, { bubbles: true, cancelable: true, ...init })
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'touch'
    // A finger's events are a frame apart; fired back to back in a test they are not.
    if (init.timeStamp != null) Object.defineProperty(this, 'timeStamp', { value: init.timeStamp })
  }
}

let clock = 1000

const WIDTH = 320
beforeEach(() => {
  // @ts-ignore - test stand-in
  window.PointerEvent = FakePointer
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => WIDTH })
  document.documentElement.classList.add('reduce-motion')
})
afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('reduce-motion')
})

/** @param {Record<string, any>} [props] */
function row(props = {}) {
  const onDelete = props.onDelete ?? vi.fn(() => true)
  const onTap = vi.fn()
  render(
    <SwipeRow label="Delete Lunch" onDelete={onDelete}>
      <button type="button" onClick={onTap}>Lunch</button>
    </SwipeRow>,
  )
  const face = /** @type {HTMLElement} */ (screen.getByText('Lunch').parentElement)
  return { onDelete, onTap, face }
}

/**
 * A finger from x to x + dx, level, a frame per step - and, like a
 * browser, the click that follows its lifting, straight after.
 *
 * @param {HTMLElement} el @param {number} dx @param {number} [dy] @param {HTMLElement} [clickOn]
 */
function drag(el, dx, dy = 0, clickOn) {
  const x0 = 300, y0 = 20, steps = 6
  fireEvent.pointerDown(el, { clientX: x0, clientY: y0, timeStamp: (clock += 16) })
  for (let i = 1; i <= steps; i++) {
    fireEvent.pointerMove(el, { clientX: x0 + (dx * i) / steps, clientY: y0 + (dy * i) / steps, timeStamp: (clock += 16) })
  }
  fireEvent.pointerUp(el, { clientX: x0 + dx, clientY: y0 + dy, timeStamp: (clock += 16) })
  if (clickOn) fireEvent.click(clickOn)
}

const shift = (/** @type {HTMLElement} */ el) => el.style.translate || '0'
const bin = () => /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Delete Lunch', hidden: true }))

describe('SwipeRow', () => {
  it('a short drag springs back and deletes nothing', async () => {
    const { face, onDelete } = row()
    await act(async () => drag(face, -30))
    expect(shift(face)).toBe('0')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('past the button, it stays open on it - and the button can be reached', async () => {
    const { face, onDelete } = row()
    expect(bin().tabIndex).toBe(-1)
    await act(async () => drag(face, -100))
    expect(shift(face)).toBe('-76px 0')
    expect(bin().tabIndex).toBe(0)
    await act(async () => { fireEvent.click(bin()) })
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('past half the row, letting go deletes', async () => {
    const { face, onDelete } = row()
    await act(async () => drag(face, -200))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('comes back when the delete went to a confirmation instead', async () => {
    const { face } = row({ onDelete: vi.fn(async () => false) })
    await act(async () => drag(face, -220))
    expect(shift(face)).toBe('0')
  })

  it('leaves a vertical drag to the list', async () => {
    const { face, onDelete } = row()
    await act(async () => drag(face, -12, 80))
    expect(shift(face)).toBe('0')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('the tap that ends a drag is not a tap on the row', async () => {
    const { face, onTap } = row()
    await act(async () => drag(face, -100, 0, screen.getByText('Lunch')))
    expect(onTap).not.toHaveBeenCalled()
  })

  it('a tap on an open row closes it, and does not open it too', async () => {
    const { face, onTap } = row()
    await act(async () => drag(face, -100))
    await new Promise(r => setTimeout(r, 0))
    await act(async () => {
      fireEvent.pointerDown(face, { clientX: 150, clientY: 20, timeStamp: (clock += 16) })
      fireEvent.pointerUp(face, { clientX: 150, clientY: 20, timeStamp: (clock += 16) })
      fireEvent.click(screen.getByText('Lunch'))
    })
    expect(shift(face)).toBe('0')
    expect(onTap).not.toHaveBeenCalled()
  })

  it('an ordinary tap still reaches the row', async () => {
    const { onTap } = row()
    fireEvent.click(screen.getByText('Lunch'))
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})
