import { useState } from 'react'
import { countryOf, symbolOf } from '../lib/currency'

/**
 * The flag behind a currency, as a disc.
 *
 * ── Where these come from ──
 *
 * country-flag-icons (MIT), copied into public/flags by scripts/copy-flags.mjs
 * and served as files. Not the regional-indicator emoji, which Windows draws
 * as two grey letter boxes and which 0.3.0 removed from this app entirely;
 * and not drawn by hand, which is 172 flags nobody should be maintaining.
 *
 * ── Why an <img> and not an import ──
 *
 * The rate table carries 180 currencies and 172 of them have a flag. Bundling
 * those is ~600KB of SVG for a list most people open once. As files they cost
 * the bundle nothing, the browser fetches only the ones actually drawn, and
 * the service worker keeps each after its first use - see the runtimeCaching
 * rule in vite.config.js, which deliberately does NOT precache them.
 *
 * The trade is that a flag you have never seen needs the network. That is why
 * the fallback below is a real design and not an error state: a grey disc
 * carrying the currency's own mark, which is exactly what this app showed
 * everywhere before flags existed.
 *
 * ── Which flag ──
 *
 * lib/currency.js decides, and refuses rather than guesses - BTC does not fly
 * the flag of Bhutan. See countryOf.
 */

/**
 * @param {object} props
 * @param {string} props.code   ISO currency code
 * @param {number} [props.size] px
 * @param {string} [props.className]
 */
export default function CurrencyFlag({ code, size = 28, className = '' }) {
  const key = String(code ?? '').toUpperCase()
  const cc = countryOf(key)
  /* One flag can fail without taking the rest of the list with it, so the
     state is per-instance rather than a shared "flags are broken" flag. */
  const [failed, setFailed] = useState(false)
  const show = cc && !failed

  return (
    <span
      className={[
        'inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full',
        /* A hairline, because a white flag on a white card has no edge -
           Japan and Indonesia would be a floating red mark with nothing
           holding it. */
        'ring-1 ring-black/[0.08] dark:ring-white/[0.14]',
        show ? '' : 'bg-slate-100 dark:bg-white/[0.08]',
        className,
      ].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {show ? (
        <img
          src={`/flags/${cc}.svg`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="w-full h-full object-cover block"
        />
      ) : (
        <span
          className="font-semibold text-slate-600 dark:text-slate-300 leading-none"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {symbolOf(key)}
        </span>
      )}
    </span>
  )
}
