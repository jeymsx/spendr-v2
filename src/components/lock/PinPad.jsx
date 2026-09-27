import { useEffect, useRef, useState } from 'react'
import { Delete } from '@untitledui/icons'
import { PIN_LENGTH } from '../../lib/appLock'

/**
 * Six digits on a keypad, the way a phone asks for its own passcode: dots
 * that fill as you type, and a grid of round keys big enough for a thumb.
 *
 * The keypad rather than the phone's keyboard: the keyboard covers half the
 * screen and brings letters a PIN has no use for, and on the lock screen
 * there is nothing else to type. A keyboard still works - digits and
 * Backspace - for the desktop.
 *
 * It calls onComplete once, with all six. To take another go the parent
 * gives it a new `key`, which starts it empty; `invalid` turns the dots red
 * in the meantime, so a wrong PIN is seen before it clears.
 *
 * @param {{
 *   onComplete: (pin: string) => void,
 *   disabled?: boolean,
 *   invalid?: boolean,
 *   left?: import('react').ReactNode,
 *   label?: string,
 * }} props
 */
export default function PinPad({ onComplete, disabled = false, invalid = false, left = null, label = 'PIN' }) {
  const [digits, setDigits] = useState('')
  const root = useRef(/** @type {HTMLDivElement|null} */ (null))
  const full = digits.length >= PIN_LENGTH
  const locked = disabled || full

  const press = (/** @type {string} */ d) => {
    if (locked) return
    const next = digits + d
    setDigits(next)
    if (next.length === PIN_LENGTH) onComplete(next)
  }
  const back = () => {
    if (!locked) setDigits(d => d.slice(0, -1))
  }

  /* Digits and Backspace from a keyboard, for as long as the pad is up and
     showing - a pad in a sheet the lock has hidden must not type along with
     the one on the lock. */
  const keys = useRef({ press, back })
  useEffect(() => { keys.current = { press, back } })
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = /** @type {any} */ (root.current)
      const html = document.documentElement.classList
      if ((html.contains('app-locked') || html.contains('app-covered')) && !el?.closest?.('.app-lock-layer')) return
      if (el?.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return
      if (/^\d$/.test(e.key)) { e.preventDefault(); keys.current.press(e.key) }
      else if (e.key === 'Backspace') { e.preventDefault(); keys.current.back() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={root} className="flex flex-col items-center">
      <div className="flex gap-4 py-2" aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`pin-dot ${i < digits.length ? 'pin-dot-on' : ''} ${invalid ? 'pin-dot-wrong' : ''}`}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{`${label}: ${digits.length} of ${PIN_LENGTH} digits`}</p>

      <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-3.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} type="button" className="pin-key press" disabled={locked} onClick={() => press(d)}>{d}</button>
        ))}
        <span className="pin-slot">{left}</span>
        <button type="button" className="pin-key press" disabled={locked} onClick={() => press('0')}>0</button>
        <span className="pin-slot">
          <button
            type="button"
            className="pin-key pin-key-quiet press"
            aria-label="Delete"
            disabled={locked || !digits.length}
            onClick={back}
          >
            <Delete size={26} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  )
}
