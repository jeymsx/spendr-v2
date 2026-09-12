// ── Constants ──────────────────────────────────────────────────────────────────

export const CURRENCIES = [
  { code: 'PHP', symbol: '₱', label: 'Philippine Peso' },
  { code: 'USD', symbol: '$',  label: 'US Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'Singapore Dollar' },
  { code: 'EUR', symbol: '€',  label: 'Euro' },
]

export const CASH = { name: 'Cash', type: 'cash', color: '#10b981' }

export const CUSTOM_TYPES = [
  { value: 'cash',    label: 'Cash'     },
  { value: 'ewallet', label: 'E-Wallet' },
  { value: 'bank',    label: 'Bank'     },
  { value: 'credit',  label: 'Credit'   },
]
