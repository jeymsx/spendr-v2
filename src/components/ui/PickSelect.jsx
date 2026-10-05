import { useState } from 'react'
/* The desktop's menu, drawn on a computer only (html.web): the phone never
   opens it. */
import Popover, { MenuItem } from '../../web/ui/Popover'

/**
 * A choice from a short list: the phone's own <select> on a phone - an
 * iPhone's wheel, Android's list, which nothing drawn in a page beats there -
 * and the desktop's menu on a computer, where a native dropdown is the
 * browser's grey list rather than Spendr's.
 *
 * A drop-in for the <select> it replaces: the same value, className and
 * style, and `onChange` gets what a select's handler gets, `{ target: { value } }`
 * with the option's value as a string, so the caller's handler is unchanged.
 * On a phone it renders exactly that select, so nothing there moves.
 *
 * On a computer the select's className goes on a button in its place, so it
 * sits in the same frame and type. `overlay` is for the select laid invisibly
 * over a label of its own (Preferences' net worth switch, a split's
 * category): the button is the same invisible layer, and the menu drops
 * from the label it covers.
 *
 * @param {{value: string|number, onChange: (e: {target: {value: string}}) => void,
 *          options: Array<{value: string|number, label: string, className?: string}>,
 *          className?: string, style?: import('react').CSSProperties, 'aria-label'?: string,
 *          placeholder?: string, overlay?: boolean, menuWidth?: number, align?: 'start'|'end'}} props
 */
export default function PickSelect({
  value, onChange, options, className = '', style, 'aria-label': ariaLabel, placeholder, overlay = false,
  menuWidth = 220, align = 'start',
}) {
  const [desktop] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('web'))
  const current = options.find(o => String(o.value) === String(value))

  if (!desktop) {
    return (
      <select value={value} onChange={e => onChange(e)} aria-label={ariaLabel} className={className} style={style}>
        {placeholder && !current && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value} className={o.className}>{o.label}</option>)}
      </select>
    )
  }

  return (
    <Popover
      role="menu"
      width={menuWidth}
      align={align}
      label={ariaLabel}
      trigger={(
        <button
          type="button"
          aria-label={ariaLabel ? `${ariaLabel}: ${current?.label ?? placeholder ?? ''}` : undefined}
          className={overlay ? className : `${className} text-left`}
          style={style}
        >
          {!overlay && (current?.label ?? placeholder ?? '')}
        </button>
      )}
    >
      <div className="max-h-[320px] overflow-y-auto">
        {options.map(o => (
          <MenuItem
            key={o.value}
            checked={String(o.value) === String(value)}
            onSelect={() => { if (String(o.value) !== String(value)) onChange({ target: { value: String(o.value) } }) }}
          >
            {o.label}
          </MenuItem>
        ))}
      </div>
    </Popover>
  )
}
