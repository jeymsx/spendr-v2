export const PH_ACCOUNTS = [
  // E-Wallets
  { name: 'GCash',              type: 'ewallet', color: '#2D9DFF', group: 'E-Wallets',         popular: true  },
  { name: 'Maya',               type: 'ewallet', color: '#06b6d4', group: 'E-Wallets',         popular: true  },
  { name: 'ShopeePay',          type: 'ewallet', color: '#ef4444', group: 'E-Wallets',         popular: false },
  { name: 'Coins.ph',           type: 'ewallet', color: '#f59e0b', group: 'E-Wallets',         popular: false },
  { name: 'GrabPay',            type: 'ewallet', color: '#00b14f', group: 'E-Wallets',         popular: false },
  { name: 'PalawanPay',         type: 'ewallet', color: '#7c3aed', group: 'E-Wallets',         popular: false },
  { name: 'Wise',               type: 'ewallet', color: '#9fde3f', group: 'E-Wallets',         popular: false },

  // Traditional Banks
  { name: 'BPI',                type: 'bank',    color: '#ef4444', group: 'Traditional Banks', popular: true  },
  { name: 'BDO',                type: 'bank',    color: '#2D9DFF', group: 'Traditional Banks', popular: true  },
  { name: 'Metrobank',          type: 'bank',    color: '#f59e0b', group: 'Traditional Banks', popular: false },
  { name: 'Security Bank',      type: 'bank',    color: '#10b981', group: 'Traditional Banks', popular: false },
  { name: 'Landbank',           type: 'bank',    color: '#22c55e', group: 'Traditional Banks', popular: false },
  { name: 'PNB',                type: 'bank',    color: '#6366f1', group: 'Traditional Banks', popular: false },
  { name: 'RCBC',               type: 'bank',    color: '#ec4899', group: 'Traditional Banks', popular: false },
  { name: 'EastWest',           type: 'bank',    color: '#06b6d4', group: 'Traditional Banks', popular: false },
  { name: 'China Bank',         type: 'bank',    color: '#8b5cf6', group: 'Traditional Banks', popular: false },
  { name: 'PSBank',             type: 'bank',    color: '#f97316', group: 'Traditional Banks', popular: false },
  { name: 'AUB',                type: 'bank',    color: '#14b8a6', group: 'Traditional Banks', popular: false },
  { name: 'Robinsons Bank',     type: 'bank',    color: '#0ea5e9', group: 'Traditional Banks', popular: false },

  // Digital Banks
  { name: 'UnionBank',          type: 'bank',    color: '#f97316', group: 'Digital Banks',     popular: true  },
  { name: 'GoTyme',             type: 'bank',    color: '#14b8a6', group: 'Digital Banks',     popular: true  },
  { name: 'CIMB',               type: 'bank',    color: '#ef4444', group: 'Digital Banks',     popular: false },
  { name: 'SeaBank',            type: 'bank',    color: '#2D9DFF', group: 'Digital Banks',     popular: false },
  { name: 'Tonik',              type: 'bank',    color: '#8b5cf6', group: 'Digital Banks',     popular: false },
  { name: 'UNO Digital Bank',   type: 'bank',    color: '#f59e0b', group: 'Digital Banks',     popular: false },
  { name: 'OwnBank',            type: 'bank',    color: '#10b981', group: 'Digital Banks',     popular: false },
  { name: 'Netbank',            type: 'bank',    color: '#6366f1', group: 'Digital Banks',     popular: false },
  { name: 'ING',                type: 'bank',    color: '#f97316', group: 'Digital Banks',     popular: false },

  // Credit Cards
  { name: 'Maya Credit',        type: 'credit',  color: '#06b6d4', group: 'Credit Cards',      popular: true  },
  { name: 'BPI Credit',         type: 'credit',  color: '#ef4444', group: 'Credit Cards',      popular: true  },
  { name: 'BDO Credit',         type: 'credit',  color: '#2D9DFF', group: 'Credit Cards',      popular: false },
  { name: 'Metrobank Credit',   type: 'credit',  color: '#f59e0b', group: 'Credit Cards',      popular: false },
  { name: 'UnionBank Credit',   type: 'credit',  color: '#f97316', group: 'Credit Cards',      popular: false },
  { name: 'Security Bank Credit', type: 'credit',color: '#10b981', group: 'Credit Cards',      popular: false },
  { name: 'RCBC Credit',        type: 'credit',  color: '#ec4899', group: 'Credit Cards',      popular: false },
  { name: 'GoTyme Credit',      type: 'credit',  color: '#14b8a6', group: 'Credit Cards',      popular: false },
  { name: 'CIMB Credit',        type: 'credit',  color: '#ef4444', group: 'Credit Cards',      popular: false },
  { name: 'Citibank',           type: 'credit',  color: '#2D9DFF', group: 'Credit Cards',      popular: false },
  { name: 'HSBC',               type: 'credit',  color: '#ef4444', group: 'Credit Cards',      popular: false },
]

export const PH_GROUPS = ['E-Wallets', 'Traditional Banks', 'Digital Banks', 'Credit Cards']

export const POPULAR_ACCOUNTS = PH_ACCOUNTS.filter(a => a.popular)

export const TYPE_ICON = {
  cash:    '💵',
  ewallet: '📱',
  bank:    '🏦',
  savings: '🏦',
  credit:  '💳',
}

export const CUSTOM_PALETTE = [
  '#10b981', '#2D9DFF', '#8b5cf6', '#f59e0b', '#ef4444',
  '#f97316', '#ec4899', '#06b6d4', '#6366f1', '#22c55e',
]
