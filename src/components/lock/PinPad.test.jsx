// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import PinPad from './PinPad'

/**
 * The keypad: six digits, then one call - by tap or by keyboard. And under
 * the app lock, only the lock's own keypad listens to the keyboard: a PIN
 * sheet left open in Settings must not pick up digits typed at the lock.
 */

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('app-locked', 'app-covered')
})

const type = (/** @type {string} */ digits) => {
  for (const key of digits) fireEvent.keyDown(window, { key })
}

describe('the keypad', () => {
  it('hands over all six digits once, from taps', () => {
    const done = vi.fn()
    const { getByText } = render(<PinPad onComplete={done} />)
    for (const d of '4829150') fireEvent.click(getByText(d))
    expect(done).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledWith('482915')
  })

  it('takes a keyboard too, with Backspace', () => {
    const done = vi.fn()
    render(<PinPad onComplete={done} />)
    type('12')
    fireEvent.keyDown(window, { key: 'Backspace' })
    type('34567')
    expect(done).toHaveBeenCalledWith('134567')
  })

  it('ignores the keyboard under the lock, unless it is the lock', () => {
    const settings = vi.fn()
    render(<PinPad onComplete={settings} />)
    document.documentElement.classList.add('app-locked')
    type('123456')
    expect(settings).not.toHaveBeenCalled()

    cleanup()
    const lock = vi.fn()
    const layer = document.createElement('div')
    layer.className = 'app-lock-layer'
    document.body.appendChild(layer)
    render(<PinPad onComplete={lock} />, { container: layer })
    type('123456')
    expect(lock).toHaveBeenCalledWith('123456')
    layer.remove()
  })

  it('does nothing while it is paused', () => {
    const done = vi.fn()
    const { getByText } = render(<PinPad onComplete={done} disabled />)
    for (const d of '123456') fireEvent.click(getByText(d))
    type('123456')
    expect(done).not.toHaveBeenCalled()
  })
})
