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
import { ThemeProvider } from '../../context/ThemeContext'
import { glassPalette } from '../glass/glass'
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
    const { container } = render(<SectionLabel className="text-center">x</SectionLabel>)
    const cls = container.firstChild.className
    expect(cls).toContain('text-center')
    expect(cls).toContain('text-xs')
  })

  it('spacing is a named option, because className could only ever raise it', () => {
    // cx is not a tailwind-merge and Tailwind emits spacing in ascending
    // order, so className="mb-0" lost to a baked-in mb-1.5 without saying so.
    // Six captions were left hand-rolled during the migration for this.
    const { container: gutter } = render(<SectionLabel inset="gutter" gap="loose">x</SectionLabel>)
    expect(gutter.firstChild.className).toContain('px-5')
    expect(gutter.firstChild.className).toContain('mb-3')
    expect(gutter.firstChild.className).not.toContain('px-1')

    cleanup()
    const { container: bare } = render(<SectionLabel inset="none" gap="none">x</SectionLabel>)
    expect(bare.firstChild.className).not.toMatch(/\bpx-/)
    expect(bare.firstChild.className).not.toMatch(/\bmb-/)
  })

  it('carries a hint without letting it become a second heading', () => {
    // Goals explained its funding order and its leftover line this way. The
    // migration dropped both rather than lose the prop.
    render(<SectionLabel hint="Top of the list is funded first.">In funding order</SectionLabel>)
    const heading = screen.getByText('In funding order')
    const hint = screen.getByText('Top of the list is funded first.')
    expect(heading.className).toContain('font-semibold')
    expect(hint.className).not.toContain('font-semibold')
    // Dimmer than the label, so the two read as a hierarchy and not a pair.
    expect(hint.className).toContain('text-slate-400')
  })

  it('puts an action on the label line, not below the hint', () => {
    // An (i) beside a label-and-hint block floats in the vertical middle of
    // two lines of text. It belongs on the label's own row.
    render(
      <SectionLabel hint="Top of the list is funded first." action={<button>i</button>}>
        In funding order
      </SectionLabel>,
    )
    const row = screen.getByText('In funding order').parentElement
    expect(row.className).toContain('flex')
    expect(row.contains(screen.getByRole('button', { name: 'i' }))).toBe(true)
    expect(row.textContent).not.toContain('funded first')
  })

  it('takes an action with no hint, and still spaces itself', () => {
    const { container } = render(
      <SectionLabel gap="loose" action={<button>i</button>}>Accounts</SectionLabel>,
    )
    expect(container.firstChild.className).toContain('mb-3')
    expect(screen.getByRole('button', { name: 'i' })).toBeTruthy()
  })

  it('insets the action row, not the label inside it', () => {
    // Otherwise the padding applies twice and the control lands 20px inside
    // the gutter instead of on it.
    render(<SectionLabel inset="gutter" action={<button>i</button>}>x</SectionLabel>)
    const label = screen.getByText('x')
    expect(label.className).not.toContain('px-5')
    expect(label.parentElement.className).toContain('px-5')
  })

  it('keeps the hint out of the label element itself', () => {
    // htmlFor names ONE control; folding a sentence into the label would make
    // the control's accessible name the label plus the explanation.
    render(<SectionLabel htmlFor="amt" hint="Pesos only.">Amount</SectionLabel>)
    const label = screen.getByText('Amount')
    expect(label.tagName).toBe('LABEL')
    expect(label.textContent).toBe('Amount')
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

  it('draws no picture at all when given neither art nor an icon', () => {
    const { container } = render(<EmptyState title="Nothing here" />)
    expect(container.querySelector('.rounded-full')).toBe(null)
    expect(container.querySelector('.glass-live, img')).toBe(null)
  })

  it('still draws the old disc for an icon, emerald when empty is good news', () => {
    // Nothing in the app passes one now; this is the way it used to be, kept.
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

describe('EmptyState with a glass picture', () => {
  afterEach(() => {
    document.documentElement.classList.remove('reduce-motion')
    localStorage.clear()
  })
  const inTheme = (/** @type {import('react').ReactNode} */ ui) => render(<ThemeProvider>{ui}</ThemeProvider>)

  it('draws `art` in the accent, and no disc', () => {
    localStorage.setItem('accentColor', '#7048E8')
    const { container } = inTheme(<EmptyState art="target" icon={<svg />} title="No goals yet" />)
    const live = container.querySelector('.glass-live')
    expect(live).not.toBe(null)
    expect(live.innerHTML).toContain(glassPalette('#7048E8').deep)
    expect(container.querySelector('.rounded-full')).toBe(null)
  })

  it('draws good news green, and takes a hue of its own over either', () => {
    const good = inTheme(<EmptyState art="allClear" tone="good" title="All clear" />)
    expect(good.container.querySelector('.glass-live').innerHTML).toContain(glassPalette('#099268').deep)
    good.unmount()
    const own = inTheme(<EmptyState art="allClear" tone="good" hue="#E8A40C" title="All clear" />)
    expect(own.container.querySelector('.glass-live').innerHTML).toContain(glassPalette('#E8A40C').deep)
  })

  it('comes together once and then holds still', () => {
    // An entrance, and no float or shine: nothing loops on an empty screen.
    const { container } = inTheme(<EmptyState art="bell" title="You're all caught up" />)
    const live = container.querySelector('.glass-live')
    expect(live.className).toContain('glass-enter')
    expect(live.className).not.toContain('glass-float')
  })

  it('is the still picture from the start under reduced motion', () => {
    document.documentElement.classList.add('reduce-motion')
    const { container } = inTheme(<EmptyState art="trash" title="Nothing deleted" />)
    expect(container.querySelector('.glass-live')).toBe(null)
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
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
    // `press` is the shared press in index.css - a shrink on a slow settle.
    const { container: quiet } = render(<Card>x</Card>)
    expect(quiet.firstChild.className.split(/\s+/)).not.toContain('press')
    cleanup()
    const { container: live } = render(<Card interactive>x</Card>)
    expect(live.firstChild.className.split(/\s+/)).toContain('press')
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
