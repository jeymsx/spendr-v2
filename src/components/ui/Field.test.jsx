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

  it('cuts the notch with a 1px invisible legend, and labels separately', () => {
    // The legend is a hole-punch, not a label: at 1px it cuts exactly the
    // border line, wherever the browser has put that line. It carries the
    // same words only to size the hole.
    const { container } = render(<Field label="Name" value="" onChange={() => {}} />)
    const fs = container.querySelector('fieldset')
    expect(fs.getAttribute('aria-hidden')).toBe('true')
    const legend = fs.querySelector('legend')
    expect(legend.className).toContain('h-px')
    expect(legend.querySelector('span').className).toContain('invisible')
    expect(legend.textContent).toBe('Name')
    // ...and the accessible name comes from a real label outside it.
    const input = screen.getByLabelText('Name')
    expect(document.querySelector(`label[for="${input.id}"]`).closest('fieldset')).toBe(null)
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
