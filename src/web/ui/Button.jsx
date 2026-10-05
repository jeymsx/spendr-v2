import { forwardRef } from 'react'

/**
 * The desktop's button.
 *
 * - `primary`: the page's one main action, in the accent.
 * - `secondary`: a bordered white button, for everything else that acts.
 * - `ghost`: no edge until hovered, for toolbars and icon buttons.
 * - `tint`: the accent on a wash of itself, for an action in a row.
 * - `danger`: a destructive action, red text on white; `danger-solid` for the
 *   confirm in a dialog.
 *
 * An icon-only button needs `label` (its accessible name and its tooltip).
 *
 * @typedef {'primary'|'secondary'|'ghost'|'tint'|'danger'|'danger-solid'} BtnVariant
 * @typedef {{variant?: BtnVariant, size?: 'sm'|'md'|'lg', icon?: import('react').ReactNode,
 *            iconRight?: import('react').ReactNode, label?: string, className?: string,
 *            children?: import('react').ReactNode} & import('react').ButtonHTMLAttributes<HTMLButtonElement>} BtnProps
 */
const Btn = forwardRef(/** @param {BtnProps} props */ function Btn(
  { variant = 'secondary', size = 'md', icon, iconRight, label, className = '', children, type = 'button', ...rest },
  ref,
) {
  const iconOnly = !children && !!icon
  return (
    <button
      ref={ref}
      type={type}
      aria-label={iconOnly ? label : rest['aria-label']}
      title={iconOnly ? label : rest.title}
      className={[
        'd-btn',
        `d-btn-${variant}`,
        size === 'sm' ? 'd-btn-sm' : size === 'lg' ? 'd-btn-lg' : '',
        iconOnly ? 'd-btn-icon' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
})

export default Btn
