// @vitest-environment jsdom
/**
 * The behaviour the 28 hand-written sheets disagreed about.
 *
 * Layout is not tested here - jsdom has no layout engine, so the float/dock
 * measurement always sees zero heights and resolves to "floats". That one is
 * checked in a real browser instead. What jsdom can answer is everything that
 * made those sheets inconsistent: dialog semantics, Escape, the scrim, focus,
 * and whether the exit animation still unmounts.
 */
import { useRef } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import Sheet from './Sheet'

afterEach(cleanup)

const open = (props = {}) => render(
  <Sheet open onClose={props.onClose ?? (() => {})} {...props}>
    <p>body</p>
  </Sheet>,
)

describe('Sheet', () => {
  it('renders nothing until it is opened', () => {
    render(<Sheet open={false} onClose={() => {}}><p>body</p></Sheet>)
    expect(screen.queryByRole('dialog')).toBe(null)
  })

  it('is a modal dialog, named by its title', () => {
    open({ title: 'Delete account?' })
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    // The name comes through aria-labelledby pointing at the heading.
    expect(screen.getByRole('dialog', { name: 'Delete account?' })).toBe(dlg)
  })

  it('falls back to ariaLabel when it has no visible title', () => {
    open({ ariaLabel: 'Choose an account' })
    expect(screen.getByRole('dialog', { name: 'Choose an account' })).toBeTruthy()
  })

  it('Escape closes it', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the scrim closes it', () => {
    const onClose = vi.fn()
    const { container } = open({ onClose })
    fireEvent.click(container.querySelector('.sheet-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('neither closes it while it is not dismissible', () => {
    const onClose = vi.fn()
    const { container } = open({ onClose, dismissible: false })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(container.querySelector('.sheet-overlay'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('takes focus on open and gives it back on close', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const { unmount } = open()
    expect(document.activeElement).toBe(screen.getByRole('dialog'))

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('keeps Tab inside itself', () => {
    render(
      <Sheet open onClose={() => {}} footer={<button>Save</button>}>
        <button>First</button>
      </Sheet>,
    )
    const first = screen.getByRole('button', { name: 'First' })
    const save = screen.getByRole('button', { name: 'Save' })

    save.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)   // wrapped forward

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save)    // and back
  })

  it('carries the class names the desktop CSS restyles', () => {
    // html.web in index.css turns .sheet-panel into a centred modal and hides
    // the handle by its w-10.h-1 selector. Renaming either breaks desktop
    // silently, so the names are pinned here.
    const { container } = open()
    expect(container.querySelector('.sheet-panel')).toBeTruthy()
    expect(container.querySelector('.sheet-overlay')).toBeTruthy()
    expect(container.querySelector('.w-10.h-1')).toBeTruthy()
  })

  it('drops the handle when asked', () => {
    const { container } = open({ handle: false })
    expect(container.querySelector('.w-10.h-1')).toBe(null)
  })

  it('stays mounted for the exit animation, then goes', () => {
    vi.useFakeTimers()
    const { rerender, container } = render(
      <Sheet open onClose={() => {}}><p>body</p></Sheet>,
    )
    rerender(<Sheet open={false} onClose={() => {}}><p>body</p></Sheet>)
    // Still there, playing .sheet-panel-exit.
    expect(container.querySelector('.sheet-panel-exit')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(260) })
    expect(screen.queryByRole('dialog')).toBe(null)
    vi.useRealTimers()
  })

  it('shows what it had while it closes, not what the caller cleared', () => {
    // The regression this fixes: a caller nulls its record inside onClose, so
    // for the 240ms of the exit the panel rendered the empty state - an
    // account form retitling itself "New account" on the way out.
    vi.useFakeTimers()
    const { rerender } = render(
      <Sheet open onClose={() => {}} title="Edit account">Metrobank</Sheet>,
    )
    rerender(<Sheet open={false} onClose={() => {}} title="New account">{null}</Sheet>)
    expect(screen.getByRole('dialog').textContent).toContain('Metrobank')
    expect(screen.getByRole('dialog').textContent).toContain('Edit account')
    act(() => { vi.advanceTimersByTime(260) })
    expect(screen.queryByRole('dialog')).toBe(null)
    vi.useRealTimers()
  })

  it('only the innermost sheet answers Escape', () => {
    // Two sheets open at once - the account form and the colour picker it
    // opened. One Escape used to close both, discarding the form.
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Sheet open onClose={outer} ariaLabel="outer">outer</Sheet>
        <Sheet open onClose={inner} ariaLabel="inner" z={130}>inner</Sheet>
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('focuses what it was told to, when it was told to', () => {
    // The debt and payment forms want the keyboard the moment they open.
    function WithField() {
      const ref = useRef(null)
      return (
        <Sheet open onClose={() => {}} ariaLabel="amount" initialFocus={ref}>
          <input ref={ref} aria-label="Amount" />
        </Sheet>
      )
    }
    render(<WithField />)
    expect(document.activeElement).toBe(screen.getByLabelText('Amount'))
  })

  it('takes its surface from the caller when given one', () => {
    // The default is bg-panel. A caller passing bg-page - the account sorter
    // and the three Settings sheets that want to read as the page rather than
    // as something laid on it - must REPLACE it, not be appended after it:
    // two bg- utilities on one element are resolved by stylesheet order, not
    // class order, so which one wins would be luck.
    const { container } = render(
      <Sheet open onClose={() => {}} surface="bg-page">x</Sheet>,
    )
    const cls = container.querySelector('.sheet-panel').className
    expect(cls).toContain('bg-page')
    expect(cls).not.toContain('bg-panel')
  })

  it('puts the stacking order and the scrim where it was told', () => {
    const { container } = open({ z: 150, scrim: 60 })
    expect(container.firstChild.style.zIndex).toBe('150')
    expect(container.querySelector('.sheet-overlay').style.backgroundColor)
      .toBe('rgba(0, 0, 0, 0.6)')
  })
})
