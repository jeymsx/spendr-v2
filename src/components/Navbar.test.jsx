// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'

/**
 * The + button, and the Android report that tapping it did nothing.
 *
 * The old handler opened the add sheet from onPointerUp and suppressed it if
 * the pointer had moved more than 12px since down. A thumb tap on Android
 * reports more drift than that while the contact flattens, so the release was
 * discarded and there was no other way in - no click handler, no keyboard.
 *
 * These pin the shape that replaced it: the browser decides what a tap is and
 * says so with a click; the pointer handlers only run the hold timer.
 */

vi.mock('../hooks/useKeyboardInset', () => ({
  useKeyboardInset: () => ({ top: 0, height: 800, inset: 0, open: false }),
}))

const HOLD_MS = 420

function setup() {
  const onAddClick = vi.fn()
  const onQuickLog = vi.fn()
  render(
    <MemoryRouter>
      <Navbar onAddClick={onAddClick} onQuickLog={onQuickLog} />
    </MemoryRouter>,
  )
  return { btn: screen.getByLabelText(/Add transaction/i), onAddClick, onQuickLog }
}

/** One tap, with the pointer stream a real touch screen produces around it. */
function tap(btn, { drift = 0, holdMs = 60 } = {}) {
  fireEvent.pointerDown(btn, { pointerType: 'touch', clientX: 100, clientY: 800 })
  if (drift) {
    fireEvent.pointerMove(btn, { pointerType: 'touch', clientX: 100 + drift, clientY: 800 })
  }
  act(() => { vi.advanceTimersByTime(holdMs) })
  fireEvent.pointerUp(btn, { pointerType: 'touch', clientX: 100 + drift, clientY: 800 })
  // The browser's own verdict. It fires for a tap however much the contact
  // wandered, which is the whole point of deferring to it.
  fireEvent.click(btn)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); cleanup() })

describe('Navbar +', () => {
  it('opens the add sheet on a clean tap', () => {
    const { btn, onAddClick, onQuickLog } = setup()
    tap(btn)
    expect(onAddClick).toHaveBeenCalledTimes(1)
    expect(onQuickLog).not.toHaveBeenCalled()
  })

  it('still opens it when the contact drifts past the old 12px slop', () => {
    const { btn, onAddClick, onQuickLog } = setup()
    tap(btn, { drift: 30 })
    expect(onAddClick).toHaveBeenCalledTimes(1)
    expect(onQuickLog).not.toHaveBeenCalled()
  })

  it('opens it from a bare click, with no pointer events at all', () => {
    // Keyboard Enter, a screen reader, or any browser that routes the tap
    // somewhere the pointer handlers never saw.
    const { btn, onAddClick } = setup()
    fireEvent.click(btn)
    expect(onAddClick).toHaveBeenCalledTimes(1)
  })

  it('quick logs on a hold, and the trailing click does not also add', () => {
    const { btn, onAddClick, onQuickLog } = setup()
    fireEvent.pointerDown(btn, { pointerType: 'touch', clientX: 100, clientY: 800 })
    act(() => { vi.advanceTimersByTime(HOLD_MS + 10) })
    expect(onQuickLog).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(btn, { pointerType: 'touch', clientX: 100, clientY: 800 })
    fireEvent.click(btn)
    expect(onAddClick).not.toHaveBeenCalled()
  })

  it('a tap after a hold adds again', () => {
    const { btn, onAddClick, onQuickLog } = setup()
    fireEvent.pointerDown(btn, { pointerType: 'touch', clientX: 100, clientY: 800 })
    act(() => { vi.advanceTimersByTime(HOLD_MS + 10) })
    fireEvent.pointerUp(btn, { pointerType: 'touch', clientX: 100, clientY: 800 })
    fireEvent.click(btn)
    tap(btn)
    expect(onQuickLog).toHaveBeenCalledTimes(1)
    expect(onAddClick).toHaveBeenCalledTimes(1)
  })

  it('a drag off the button cancels the hold', () => {
    const { btn, onQuickLog } = setup()
    fireEvent.pointerDown(btn, { pointerType: 'touch', clientX: 100, clientY: 800 })
    fireEvent.pointerMove(btn, { pointerType: 'touch', clientX: 160, clientY: 800 })
    act(() => { vi.advanceTimersByTime(HOLD_MS + 50) })
    expect(onQuickLog).not.toHaveBeenCalled()
  })

  it('pointercancel cancels the hold', () => {
    const { btn, onQuickLog } = setup()
    fireEvent.pointerDown(btn, { pointerType: 'touch', clientX: 100, clientY: 800 })
    fireEvent.pointerCancel(btn, { pointerType: 'touch' })
    act(() => { vi.advanceTimersByTime(HOLD_MS + 50) })
    expect(onQuickLog).not.toHaveBeenCalled()
  })
})
