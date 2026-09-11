// @vitest-environment jsdom
/**
 * What matters about a field is that it is still a field: labelled, typeable,
 * and able to say when it is wrong. The notch is geometry and is checked in a
 * browser; these are the parts jsdom can hold to account.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import Field from './Field'

afterEach(cleanup)

describe('Field', () => {
  it('the label names the input, so it can be found by it', () => {
    render(<Field label="Category name" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Category name').tagName).toBe('INPUT')
  })

  it('clicking the label focuses the input', () => {
    render(<Field label="Category name" value="" onChange={() => {}} />)
    const input = screen.getByLabelText('Category name')
    // htmlFor/id wiring is what does this; a <legend> alone would not.
    expect(input.id).toBeTruthy()
    expect(document.querySelector(`label[for="${input.id}"]`)).toBeTruthy()
  })

  it('types through to onChange', () => {
    const onChange = vi.fn()
    render(<Field label="Name" value="" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jeepney' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('passes through the props that decide the iOS keyboard', () => {
    render(<Field label="Budget" inputMode="decimal" maxLength={9} value="" onChange={() => {}} />)
    const input = screen.getByLabelText('Budget')
    expect(input.getAttribute('inputmode')).toBe('decimal')
    expect(input.getAttribute('maxlength')).toBe('9')
  })

  it('an error marks the input invalid and describes it', () => {
    render(<Field label="Name" error="Name is required" value="" onChange={() => {}} />)
    const input = screen.getByLabelText('Name')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const msg = document.getElementById(input.getAttribute('aria-describedby'))
    expect(msg.textContent).toBe('Name is required')
  })

  it('an error replaces the hint rather than stacking with it', () => {
    render(
      <Field label="Name" hint="Up to 30 characters" error="Name is required"
        value="" onChange={() => {}} />,
    )
    expect(screen.queryByText('Up to 30 characters')).toBe(null)
    expect(screen.getByText('Name is required')).toBeTruthy()
  })

  it('a hint alone describes the input and is not an error', () => {
    render(<Field label="Budget" hint="0 = no budget" value="" onChange={() => {}} />)
    const input = screen.getByLabelText('Budget')
    expect(input.getAttribute('aria-invalid')).toBe(null)
    expect(document.getElementById(input.getAttribute('aria-describedby')).textContent)
      .toBe('0 = no budget')
  })

  it('wears the shared frame: a capsule, 52px, filled', () => {
    // The look is the point of the component, so the three things that make a
    // field recognisable as one are pinned here.
    const { container } = render(<Field label="Name" value="" onChange={() => {}} />)
    const frame = container.querySelector('input').parentElement.className
    expect(frame).toContain('rounded-full')
    expect(frame).toContain('h-[52px]')
    expect(frame).toContain('bg-white')
  })

  it('turns the frame red when it is invalid', () => {
    const { container } = render(
      <Field label="Name" error="Required" value="" onChange={() => {}} />,
    )
    expect(container.querySelector('input').parentElement.className)
      .toContain('border-red-300')
  })

  it('labels children without claiming to own them', () => {
    // A <label for> pointed at a picker button would name a control it does
    // not wrap, so with children the label is a plain caption.
    const { container } = render(
      <Field label="Category"><button type="button">Groceries</button></Field>,
    )
    expect(container.querySelector('label')).toBe(null)
    expect(screen.getByText('Category').tagName).toBe('P')
  })

  it('disabled reaches the input', () => {
    render(<Field label="Type" disabled value="Expense" onChange={() => {}} />)
    expect(screen.getByLabelText('Type').disabled).toBe(true)
  })

  it('children replace the input, for a field that is not a text box', () => {
    const { container } = render(
      <Field label="Category">
        <button type="button">Groceries</button>
      </Field>,
    )
    expect(container.querySelector('input')).toBe(null)
    expect(screen.getByRole('button', { name: 'Groceries' })).toBeTruthy()
  })
})
