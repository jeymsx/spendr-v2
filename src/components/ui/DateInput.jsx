import { useState } from 'react'
/* The desktop's calendar, drawn on a computer only (html.web): the phone
   never opens it. */
import Popover from '../../web/ui/Popover'
import DatePanel from '../../web/ui/DatePanel'

/**
 * A date field: the phone's own <input type="date"> on a phone - an iPhone's
 * wheel, Android's calendar, which nothing drawn in a page beats there - and
 * the desktop's calendar on a computer (web/ui/DatePanel), where the native
 * one is the browser's grey popup rather than Spendr's. PickSelect does the
 * same for a dropdown.
 *
 * A drop-in for the input it replaces: the same value, min, max, className,
 * style, id and label, and `onChange` gets what an input's handler gets,
 * `{ target: { value } }` with the day as 'YYYY-MM-DD', so the caller's
 * handler is unchanged. On a phone it renders exactly that input, so nothing
 * there moves.
 *
 * On a computer the input's className goes on a button in its place, so it
 * sits in the same frame and type, showing the day written out ("Tue, Oct 6,
 * 2026"; `short` drops the weekday). `overlay` is for the input laid
 * invisibly over a date drawn by the caller (a form row, the goal's target
 * date): the button is the same invisible layer, and the calendar drops from
 * the row it covers. `align` lines the calendar up with the trigger's start
 * or end; `clearable` adds a way back to no date.
 *
 * @param {{value: string, onChange: (e: {target: {value: string}}) => void, min?: string, max?: string,
 *          className?: string, style?: import('react').CSSProperties, id?: string, 'aria-label'?: string,
 *          onClick?: (e: import('react').MouseEvent<HTMLInputElement>) => void,
 *          overlay?: boolean, short?: boolean, align?: 'start'|'end', clearable?: boolean, placeholder?: string}} props
 */
export default function DateInput({
  value, onChange, min, max, className = '', style, id, 'aria-label': ariaLabel, onClick,
  overlay = false, short = false, align = 'start', clearable = false, placeholder = 'Pick a date',
}) {
  const [desktop] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('web'))

  if (!desktop) {
    return (
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        onClick={onClick}
        aria-label={ariaLabel}
        className={className}
        style={style}
      />
    )
  }

  const shown = value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', short
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : placeholder
  return (
    <Popover
      role="dialog"
      label={ariaLabel ?? 'Date'}
      align={align}
      trigger={(
        <button
          type="button"
          id={id}
          aria-label={`${ariaLabel ?? 'Date'}: ${value ? shown : 'none'}`}
          className={overlay ? className : `${className} text-left`}
          style={style}
        >
          {!overlay && shown}
        </button>
      )}
    >
      {(close) => (
        <DatePanel
          value={value}
          min={min}
          max={max}
          clearable={clearable}
          label={ariaLabel}
          onPick={(d) => { close(); if (d !== value) onChange({ target: { value: d } }) }}
        />
      )}
    </Popover>
  )
}
