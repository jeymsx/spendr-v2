import { currencyOf, symbolOf } from '../../lib/currency'

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * The currencies offered on the first screen.
 *
 * A shortlist, not the whole registry: twenty-two tiles on the first screen
 * somebody ever sees would be a worse question than four. But the symbol and
 * the name come FROM the registry rather than being typed again here, which
 * is how they were before - and how the dollar tile would have ended up
 * disagreeing with the dollar sign the rest of the app draws.
 *
 * Anything not on this list is still reachable from Settings, where a full
 * list is a list rather than a first impression.
 */
const OFFERED = ['PHP', 'USD', 'SGD', 'EUR', 'AED', 'AUD', 'JPY', 'GBP']

export const CURRENCIES = OFFERED.map(code => ({
  code,
  symbol: symbolOf(code),
  label: currencyOf(code).name,
}))

export const CASH = { name: 'Cash', type: 'cash', color: '#10b981' }

export const CUSTOM_TYPES = [
  { value: 'cash',    label: 'Cash'     },
  { value: 'ewallet', label: 'E-Wallet' },
  { value: 'bank',    label: 'Bank'     },
  { value: 'credit',  label: 'Credit'   },
]
