// @vitest-environment jsdom
/**
 * The first DOM tests in the project.
 *
 * The environment is set per file rather than in the config, so the 257 logic
 * tests keep running in plain node at full speed and only the component tests
 * pay for a jsdom.
 *
 * Plain expect assertions, no jest-dom: `btn.disabled` and `getAttribute` say
 * the same thing as `toBeDisabled()` without a fifth testing dependency and a
 * setup file to register matchers.
 *
 * What is worth testing in a primitive is not how it looks - a class-list
 * assertion is mostly a tautology - but the behaviour the 89 hand-written
 * buttons disagreed about: what disabled does, what loading does, whether a
 * press reaches the handler, and whether it submits a form it happens to be
 * standing in.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Button from './Button'
import IconButton from './IconButton'

afterEach(cleanup)

describe('Button', () => {
  it('renders its label and calls onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save Transaction</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Save Transaction' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is type="button" by default, so it cannot submit a form it sits in', () => {
    const onSubmit = vi.fn(e => e.preventDefault())
    render(<form onSubmit={onSubmit}><Button>Review</Button></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('still submits when explicitly asked to', () => {
    const onSubmit = vi.fn(e => e.preventDefault())
    render(<form onSubmit={onSubmit}><Button type="submit">Go</Button></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('disabled blocks the handler', () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('loading disables, announces itself, and shows one spinner', () => {
    const onClick = vi.fn()
    const { container } = render(<Button loading onClick={onClick}>Saving…</Button>)
    const btn = screen.getByRole('button', { name: 'Saving…' })
    // The whole point: a second tap while the first save is in flight must
    // not write the transaction twice.
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.animate-spin').length).toBe(1)
  })

  it('is not aria-busy when it is idle', () => {
    render(<Button>Idle</Button>)
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe(null)
  })

  it('every variant and size renders a capsule', () => {
    for (const variant of ['primary', 'secondary', 'danger', 'tint', 'quiet']) {
      for (const size of ['sm', 'md', 'lg']) {
        cleanup()
        render(<Button variant={variant} size={size}>x</Button>)
        expect(screen.getByRole('button').className).toContain('rounded-full')
      }
    }
  })

  it('an unknown variant falls back rather than rendering an unstyled button', () => {
    render(<Button variant="magenta">x</Button>)
    expect(screen.getByRole('button').className).toContain('bg-primary')
  })

  it('block is full width, and className is appended for layout', () => {
    render(<Button block className="mt-6 flex-[2]">Wide</Button>)
    const cls = screen.getByRole('button').className
    expect(cls).toContain('w-full')
    expect(cls).toContain('mt-6')
    expect(cls).toContain('flex-[2]')
  })

  it('passes through the props a caller still needs', () => {
    render(<Button aria-label="Post bill" data-testid="post">Post</Button>)
    expect(screen.getByTestId('post').getAttribute('aria-label')).toBe('Post bill')
  })
})

describe('IconButton', () => {
  it('gets its accessible name from label', () => {
    render(<IconButton label="Back"><svg /></IconButton>)
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
  })

  it('renders the glyph it was given', () => {
    const { container } = render(
      <IconButton label="Sort accounts"><svg data-testid="glyph" /></IconButton>,
    )
    expect(container.querySelector('[data-testid="glyph"]')).toBeTruthy()
  })

  it('is round at every size', () => {
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      cleanup()
      render(<IconButton label="x" size={size}><svg /></IconButton>)
      expect(screen.getByRole('button').className).toContain('rounded-full')
    }
  })

  it('disabled blocks the handler', () => {
    const onClick = vi.fn()
    render(<IconButton label="Close" disabled onClick={onClick}><svg /></IconButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
