// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import Collapsible, { useOpenState } from './Collapsible'

/**
 * A card that folds its body under a row: the row says whether it is open,
 * names what it opens, and the body is there only while open.
 */

afterEach(() => { cleanup(); sessionStorage.clear() })

/** @param {{storageKey: string, fallback: boolean}} props */
function Harness({ storageKey, fallback }) {
  const [open, toggle] = useOpenState(storageKey, fallback)
  return (
    <Collapsible open={open} onToggle={toggle} header={<span>Last statement</span>} top={<p>Remaining due</p>}>
      <p>Shopee</p>
    </Collapsible>
  )
}

describe('Collapsible', () => {
  it('opens and shuts from its row, saying which it is', async () => {
    render(<Harness storageKey="t1" fallback={false} />)
    const row = screen.getByRole('button', { name: 'Last statement' })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Shopee')).toBeNull()
    // What sits above the row is always there.
    expect(screen.getByText('Remaining due')).toBeTruthy()

    await act(async () => { fireEvent.click(row) })
    expect(row.getAttribute('aria-expanded')).toBe('true')
    const body = document.getElementById(/** @type {string} */ (row.getAttribute('aria-controls')))
    expect(body?.textContent).toBe('Shopee')
    expect(body?.getAttribute('role')).toBe('region')

    await act(async () => { fireEvent.click(row) })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    // jsdom has no element.animate, so it goes at once.
    expect(screen.queryByText('Shopee')).toBeNull()
  })

  it('opens on its default, and remembers a choice for the visit', async () => {
    const { unmount } = render(<Harness storageKey="t2" fallback={true} />)
    expect(screen.getByText('Shopee')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Last statement' })) })
    unmount()
    render(<Harness storageKey="t2" fallback={true} />)
    expect(screen.queryByText('Shopee')).toBeNull()
    expect(sessionStorage.getItem('spendr-open:t2')).toBe('0')
  })

  it('starts from the default again under a new key', () => {
    sessionStorage.setItem('spendr-open:old', '0')
    render(<Harness storageKey="new" fallback={true} />)
    expect(screen.getByText('Shopee')).toBeTruthy()
  })
})
