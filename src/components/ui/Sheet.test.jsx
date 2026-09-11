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

  it('puts the stacking order and the scrim where it was told', () => {
    const { container } = open({ z: 150, scrim: 60 })
    expect(container.firstChild.style.zIndex).toBe('150')
    expect(container.querySelector('.sheet-overlay').style.backgroundColor)
      .toBe('rgba(0, 0, 0, 0.6)')
  })
})
