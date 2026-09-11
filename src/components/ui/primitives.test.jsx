// @vitest-environment jsdom
/**
 * The contracts the 65 captions, 46 hairlines and 8 empty states disagreed
 * about.
 *
 * These are not "does React render" tests. Each one pins a decision that was
 * made by measuring the call sites, and that a future edit could quietly
 * undo: which end of the slate ramp a caption uses, whether a separator is
 * announced, whether a card you can press answers the press, whether the
 * last row in a group draws a line under itself.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import SectionLabel from './SectionLabel'
import Divider from './Divider'
import EmptyState from './EmptyState'
import Card from './Card'
import DetailRow from './DetailRow'

afterEach(cleanup)

describe('SectionLabel', () => {
  it('is a <p>, not a <label>, when it names no control', () => {
    // A heading over a list that claims to be a label sends a screen reader
    // looking for the control it names.
    const { container } = render(<SectionLabel>Amount range</SectionLabel>)
    expect(container.firstChild.tagName).toBe('P')
    expect(container.firstChild.hasAttribute('for')).toBe(false)
  })

  it('becomes a real <label> when given something to point at', () => {
    render(<SectionLabel htmlFor="amt">Amount</SectionLabel>)
    const el = screen.getByText('Amount')
    expect(el.tagName).toBe('LABEL')
    expect(el.getAttribute('for')).toBe('amt')
  })

  it('uses the brighter end of the ramp in light mode', () => {
    // 53 of 65 call sites were one of two recipes that differ only by having
    // this inverted. slate-400 on white is at the edge of legible.
    const { container } = render(<SectionLabel>x</SectionLabel>)
    const cls = container.firstChild.className
    expect(cls).toContain('text-slate-500')
    expect(cls).toContain('dark:text-slate-400')
  })

  it('takes layout from the caller without losing its own style', () => {
    const { container } = render(<SectionLabel className="mb-3">x</SectionLabel>)
    const cls = container.firstChild.className
    expect(cls).toContain('mb-3')
    expect(cls).toContain('text-xs')
  })
})

describe('Divider', () => {
  it('is not announced', () => {
    const { container } = render(<Divider />)
    expect(container.firstChild.getAttribute('aria-hidden')).toBe('true')
  })

  it('is one hairline recipe', () => {
    const { container } = render(<Divider />)
    const cls = container.firstChild.className
    expect(cls).toContain('bg-slate-100')
    expect(cls).toContain('dark:bg-white/[0.07]')
  })

  it('insets to where the row content starts', () => {
    // A separator flush to the card edge cuts the card in half rather than
    // separating two things inside it.
    const { container: row } = render(<Divider inset="row" />)
    expect(row.firstChild.className).toContain('mx-4')
    cleanup()
    const { container: glyph } = render(<Divider inset="glyph" />)
    expect(glyph.firstChild.className).toContain('ml-14')
  })

  it('falls back to full bleed on an unknown inset rather than throwing', () => {
    const { container } = render(<Divider inset="nonsense" />)
    expect(container.firstChild.className).toContain('h-px')
  })
})

describe('EmptyState', () => {
  it('says what is empty and what to do about it', () => {
    render(<EmptyState title="No debts yet" body="Track what you owe." />)
    expect(screen.getByText('No debts yet')).toBeTruthy()
    expect(screen.getByText('Track what you owe.')).toBeTruthy()
  })

  it('drops the disc when there is no icon', () => {
    // A 56px disc inside a card section is louder than the section it sits in.
    const { container } = render(<EmptyState title="Nothing here" />)
    expect(container.querySelector('.rounded-full')).toBe(null)
  })

  it('turns the disc emerald when empty is good news', () => {
    const { container } = render(
      <EmptyState icon={<svg />} title="Nothing overdue" tone="good" />,
    )
    expect(container.querySelector('.rounded-full').className).toContain('emerald')
  })

  it('renders the way out when given one', () => {
    render(<EmptyState title="No goals yet" action={<button>Add a goal</button>} />)
    expect(screen.getByRole('button', { name: 'Add a goal' })).toBeTruthy()
  })
})

describe('Card', () => {
  it('takes its paint from .card and its shape from here', () => {
    const { container } = render(<Card>x</Card>)
    const cls = container.firstChild.className
    expect(cls).toContain('card')
    expect(cls).toContain('rounded-2xl')
  })

  it('recessed is a different surface, not .card', () => {
    // A raised group inside an already-raised sheet has no visible edge.
    const { container } = render(<Card surface="recessed">x</Card>)
    const cls = container.firstChild.className
    expect(cls).not.toMatch(/(^|\s)card(\s|$)/)
    expect(cls).toContain('bg-slate-50')
  })

  it('becomes the element it is told to, and a button gets full width', () => {
    const { container } = render(<Card as="button" onClick={() => {}}>x</Card>)
    expect(container.firstChild.tagName).toBe('BUTTON')
    expect(container.firstChild.className).toContain('w-full')
  })

  it('answers a press only when it is interactive', () => {
    const { container: quiet } = render(<Card>x</Card>)
    expect(quiet.firstChild.className).not.toContain('active:scale')
    cleanup()
    const { container: live } = render(<Card interactive>x</Card>)
    expect(live.firstChild.className).toContain('active:scale-[0.98]')
  })

  it('clips its children only when asked', () => {
    const { container } = render(<Card clip>x</Card>)
    expect(container.firstChild.className).toContain('overflow-hidden')
  })
})

describe('DetailRow', () => {
  it('puts the label left and the value right', () => {
    render(<DetailRow label="Account" value="GCash" />)
    expect(screen.getByText('Account')).toBeTruthy()
    expect(screen.getByText('GCash')).toBeTruthy()
  })

  it('draws a separator under itself, except on the last row', () => {
    const { container: mid } = render(<DetailRow label="a" value="b" />)
    expect(mid.querySelector('[aria-hidden="true"]')).toBeTruthy()
    cleanup()
    const { container: last } = render(<DetailRow label="a" value="b" isLast />)
    expect(last.querySelector('[aria-hidden="true"]')).toBe(null)
  })

  it('drops its horizontal padding outside a card', () => {
    const { container } = render(<DetailRow label="a" value="b" padded={false} />)
    expect(container.firstChild.className).not.toContain('px-4')
  })

  it('lets the value carry a meaning in colour', () => {
    render(<DetailRow label="Fee" value="₱25" tone="text-amber-600" />)
    expect(screen.getByText('₱25').className).toContain('text-amber-600')
  })
})
