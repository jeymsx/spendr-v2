import { memo, useEffect, useRef } from 'react'

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
]

function BackspaceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
      <line x1="18" y1="9" x2="12" y2="15" />
      <line x1="12" y1="9" x2="18" y2="15" />
    </svg>
  )
}

const KeyButton = memo(function KeyButton({ value, onPress }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onPress() }}
      className="h-[52px] rounded-2xl flex items-center justify-center select-none
        text-xl font-semibold text-slate-800 dark:text-white
        bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.07)]
        dark:bg-white/[0.07] dark:border-white/[0.09] dark:shadow-none
        active:scale-[0.88] active:bg-slate-100 dark:active:bg-white/[0.14]
        transition-transform duration-[55ms]"
    >
      {value === 'backspace' ? <BackspaceIcon /> : value}
    </button>
  )
})

/**
 * Also accepts a real keyboard.
 *
 * The pad is the only way to enter a debt payment, and on a desktop that
 * meant clicking digits with a mouse while a keyboard sat right there. Typing
 * now drives the same handler the buttons do, so nothing about the pad's
 * appearance or its touch behaviour changes - a phone simply never fires
 * these events.
 *
 * Keystrokes are ignored while a field has focus, so the account picker's own
 * inputs keep their typing, and modifier combinations are left alone so
 * browser shortcuts still work.
 */
export default function NumericKeypad({
  onKey,
  onConfirm,
  confirmLabel   = 'Confirm',
  confirmDisabled = false,
  confirmLoading  = false,
}) {
  const live = useRef({ onKey, onConfirm, confirmDisabled, confirmLoading })
  live.current = { onKey, onConfirm, confirmDisabled, confirmLoading }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const el = document.activeElement
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return

      const { onKey: press, onConfirm: confirm, confirmDisabled: off, confirmLoading: busy } = live.current
      if (/^[0-9]$/.test(e.key))            { e.preventDefault(); press(e.key) }
      else if (e.key === '.' || e.key === ',') { e.preventDefault(); press('.') }
      else if (e.key === 'Backspace')       { e.preventDefault(); press('backspace') }
      else if (e.key === 'Enter')           { e.preventDefault(); if (!off && !busy) confirm?.() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="space-y-2">
      {ROWS.map((row, i) => (
        <div key={i} className="grid grid-cols-3 gap-2">
          {row.map(key => (
            <KeyButton key={key} value={key} onPress={() => onKey(key)} />
          ))}
        </div>
      ))}

      <button
        onClick={onConfirm}
        disabled={confirmDisabled || confirmLoading}
        className="w-full py-[15px] rounded-2xl font-semibold text-[15px] text-white mt-1
          bg-primary shadow-[0_4px_20px_rgba(var(--color-primary-rgb),0.45)]
          disabled:opacity-35 disabled:shadow-none
          active:scale-[0.98] transition-all duration-100"
      >
        {confirmLoading ? 'Saving…' : confirmLabel}
      </button>
    </div>
  )
}
