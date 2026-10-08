// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useEffect } from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ToastProvider, useToast, setToastPresenter } from './ToastContext'

/** The provider's API, handed out of the tree the way a page would use it. @type {ReturnType<typeof useToast>} */
let api
function Grab() {
  const toast = useToast()
  useEffect(() => { api = toast })
  return null
}
const mount = () => render(<ToastProvider><Grab /></ToastProvider>)
const host = () => /** @type {HTMLElement} */ (document.querySelector('.toast-host'))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('the phone toast', () => {
  it('shows the words', () => {
    mount()
    act(() => { api.showToast('Transaction saved') })
    expect(screen.getByRole('status').textContent).toBe('Transaction saved')
    expect(host().className).toContain('opacity-100')
  })

  it('keeps its words while it fades, rather than shrinking to a bare tick', () => {
    mount()
    act(() => { api.showToast('Transaction saved') })
    act(() => { vi.advanceTimersByTime(2600) })
    expect(host().className).toContain('opacity-0')
    expect(screen.getByRole('status').textContent).toBe('Transaction saved')
  })

  it('cannot be pressed while it fades', () => {
    mount()
    const undo = vi.fn()
    act(() => { api.showToast('Moved to Recently deleted', 'success', { actionLabel: 'Undo', onAction: undo }) })
    expect(host().className).not.toContain('pointer-events-none')
    act(() => { vi.advanceTimersByTime(6100) })
    expect(host().className).toContain('pointer-events-none')
    expect(screen.getByRole('button', { hidden: true }).tabIndex).toBe(-1)
  })

  it('runs its action once, and goes', () => {
    mount()
    const undo = vi.fn()
    act(() => { api.showToast('Moved to Recently deleted', 'success', { actionLabel: 'Undo', onAction: undo }) })
    const button = screen.getByRole('button')
    act(() => { button.click(); button.click() })
    expect(undo).toHaveBeenCalledTimes(1)
    expect(host().className).toContain('opacity-0')
  })

  it('a new toast takes the place of the last, as a new element so its words come in fresh', () => {
    mount()
    act(() => { api.showToast('Transaction saved') })
    const first = host().firstElementChild
    act(() => { vi.advanceTimersByTime(5) })
    act(() => { api.showToast('Filed under Food') })
    expect(screen.getByRole('status').textContent).toBe('Filed under Food')
    expect(host().firstElementChild).not.toBe(first)
    expect(host().firstElementChild?.className).toContain('toast-swap')
  })

  it('drops news that can wait rather than cover a toast with an Undo on it', () => {
    mount()
    act(() => { api.showToast('Moved to Recently deleted', 'success', { actionLabel: 'Undo', onAction: () => {} }) })
    act(() => { api.showToast('From your other device: Lunch', 'success', { ifIdle: true }) })
    expect(screen.getByRole('status').textContent).toBe('Moved to Recently deleted')
  })
})

describe('somewhere else to show them', () => {
  it('hands every toast to the presenter while there is one, and the bar shows nothing', () => {
    mount()
    const show = vi.fn()
    const stop = setToastPresenter({ show, dismiss: () => {} })
    act(() => { api.showToast('Transaction saved', 'success') })
    expect(show).toHaveBeenCalledWith({ message: 'Transaction saved', type: 'success', actionLabel: null, onAction: null, duration: undefined })
    expect(screen.getByRole('status').textContent).toBe('')
    stop()
    act(() => { api.showToast('Back on the bar') })
    expect(screen.getByRole('status').textContent).toBe('Back on the bar')
  })
})
