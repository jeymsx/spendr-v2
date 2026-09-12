// @vitest-environment jsdom
/**
 * The two components that draw a proportion, and the row of three readings
 * that usually sits under them.
 *
 * These had no tests, and they are not decorative: a bar that reports the
 * wrong fraction of a budget, or a meter that puts its handle in the wrong
 * place on a credit limit, is a wrong number on the screen rather than a
 * layout bug. What is worth pinning is the ARITHMETIC - the clamping, the
 * sliver, the handle inset - not the classes, which are free to change.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ProgressBar from './ProgressBar'
import LimitMeter, { limitTone } from '../LimitMeter'
import StatTrio from './StatTrio'
import AmountHero from './AmountHero'
import SwatchRail from './SwatchRail'
import Skeleton from './Skeleton'

afterEach(cleanup)

/** The fill is the only child with an inline width. */
const fillWidth = (container) =>
  [...container.querySelectorAll('[style]')]
    .map(el => el.style.width)
    .find(Boolean)

describe('ProgressBar', () => {
  it('fills to the value it is given', () => {
    const { container } = render(<ProgressBar value={40} />)
    expect(fillWidth(container)).toBe('40%')
  })

  it('clamps above 100 rather than overflowing its track', () => {
    const { container } = render(<ProgressBar value={140} />)
    expect(fillWidth(container)).toBe('100%')
  })

  it('clamps a negative to empty', () => {
    const { container } = render(<ProgressBar value={-20} />)
    expect(fillWidth(container)).toBe('0%')
  })

  /**
   * A goal with ₱40 against a ₱100,000 target rounds to a bar you cannot see,
   * which reads as "nothing saved" rather than "barely started". Goals and
   * Debts both did this by hand before the primitive existed.
   */
  it('shows a 2% sliver for any non-zero value', () => {
    const { container } = render(<ProgressBar value={0.04} />)
    expect(fillWidth(container)).toBe('2%')
  })

  it('shows nothing at all at exactly zero', () => {
    const { container } = render(<ProgressBar value={0} />)
    expect(fillWidth(container)).toBe('0%')
  })

  /**
   * `scale` shortens the TRACK, for bars meant to be compared with each other -
   * Budget's "where the budget goes" rows, where the track's own length carries
   * the size of the limit. A scaled bar cannot clip its own corners, so it
   * renders as two absolutely-positioned siblings rather than a nested fill.
   */
  it('at a scale under 100, the fill sits on the same origin as the track', () => {
    const { container } = render(<ProgressBar value={50} scale={60} marker />)
    const widths = [...container.querySelectorAll('[style]')].map(el => el.style.width)
    expect(widths).toContain('60%')   // the track
    expect(widths).toContain('50%')   // the fill, on the same origin
  })
})

describe('limitTone', () => {
  it('is the accent below 70%, amber to 90, red past it', () => {
    expect(limitTone(0)).toBe('accent')
    expect(limitTone(69.9)).toBe('accent')
    expect(limitTone(70)).toBe('warn')
    expect(limitTone(89.9)).toBe('warn')
    expect(limitTone(90)).toBe('bad')
    expect(limitTone(150)).toBe('bad')
  })
})

describe('LimitMeter', () => {
  it('reports its percentage to assistive tech, rounded', () => {
    render(<LimitMeter pct={42.4} label="₱29,000.00 left" />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('42')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })

  it('clamps a percentage past its own limit', () => {
    render(<LimitMeter pct={130} />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
  })

  it('draws no handle at zero, because there is no position to mark', () => {
    const { container } = render(<LimitMeter pct={0} />)
    // The handle is the only element carrying a border in its inline style.
    const handles = [...container.querySelectorAll('[style]')].filter(el => el.style.border)
    expect(handles.length).toBe(0)
  })

  it('draws one once there is anything to mark', () => {
    const { container } = render(<LimitMeter pct={1} />)
    const handles = [...container.querySelectorAll('[style]')].filter(el => el.style.border)
    expect(handles.length).toBe(1)
  })

  it('shows the label and the used / total pair when given them', () => {
    render(<LimitMeter pct={50} label="₱25,000.00 left" used="₱25,000.00" total="₱50,000.00" />)
    expect(screen.getByText('₱25,000.00 left')).toBeTruthy()
    expect(screen.getByText('₱25,000.00')).toBeTruthy()
  })
})

describe('StatTrio', () => {
  it('leads with the figure and puts the label under it', () => {
    const { container } = render(
      <StatTrio items={[
        { label: 'Funded', value: '2 / 4' },
        { label: 'Still to save', value: '₱203.2K' },
        { label: 'Unassigned', value: '₱11.3K' },
      ]} />,
    )
    const first = container.firstChild.firstChild
    // Figure first in the DOM, which is the reading order the row exists for.
    expect(first.children[0].textContent).toBe('2 / 4')
    expect(first.children[1].textContent).toBe('Funded')
  })

  it('renders one column per item', () => {
    const { container } = render(
      <StatTrio items={[{ label: 'a', value: '1' }, { label: 'b', value: '2' }]} />)
    expect(container.firstChild.children.length).toBe(2)
  })
})

describe('AmountHero', () => {
  it('shows the figure it is handed, already formatted by the caller', () => {
    render(<AmountHero color="#ef4444">−₱1,200.00</AmountHero>)
    expect(screen.getByText('−₱1,200.00')).toBeTruthy()
  })

  it('shows the quieter sub-line when there is one', () => {
    render(<AmountHero color="#000" sub="3 of 12 instalments">₱4,000.00</AmountHero>)
    expect(screen.getByText('3 of 12 instalments')).toBeTruthy()
  })

  it('hides its rule from assistive tech', () => {
    const { container } = render(<AmountHero color="#000">₱1.00</AmountHero>)
    expect(container.querySelector('svg').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('SwatchRail', () => {
  it('reports the colour that was picked', () => {
    const onChange = vi.fn()
    render(<SwatchRail colors={['#ef4444', '#10b981']} value="#ef4444" onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('button')[1])
    expect(onChange).toHaveBeenCalledWith('#10b981')
  })

  it('names the group for a screen reader, since the swatches have no text', () => {
    render(<SwatchRail colors={['#ef4444']} value="#ef4444" onChange={vi.fn()} ariaLabel="Accent" />)
    expect(screen.getByRole('group', { name: 'Accent' })).toBeTruthy()
  })

  it('marks the current one as pressed, not just coloured', () => {
    render(<SwatchRail colors={['#ef4444', '#10b981']} value="#10b981" onChange={vi.fn()} />)
    const pressed = screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true')
    expect(pressed.length).toBe(1)
  })
})

describe('Skeleton', () => {
  it('is hidden from assistive tech - it is a placeholder, not content', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />)
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true')
  })
})
