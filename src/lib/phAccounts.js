export const PH_ACCOUNTS = [
  // E-Wallets
  { name: 'GCash',                 type: 'ewallet', color: '#2D9DFF', group: 'E-Wallets'    },
  { name: 'Maya',                  type: 'ewallet', color: '#06b6d4', group: 'E-Wallets'    },
  { name: 'ShopeePay',             type: 'ewallet', color: '#ef4444', group: 'E-Wallets'    },
  { name: 'Coins.ph',              type: 'ewallet', color: '#f59e0b', group: 'E-Wallets'    },
  { name: 'PayMaya',               type: 'ewallet', color: '#8b5cf6', group: 'E-Wallets'    },
  // Banks
  { name: 'BPI',                   type: 'bank',    color: '#ef4444', group: 'Banks'        },
  { name: 'BDO',                   type: 'bank',    color: '#2D9DFF', group: 'Banks'        },
  { name: 'Metrobank',             type: 'bank',    color: '#f59e0b', group: 'Banks'        },
  { name: 'UnionBank',             type: 'bank',    color: '#f97316', group: 'Banks'        },
  { name: 'Security Bank',         type: 'bank',    color: '#10b981', group: 'Banks'        },
  { name: 'Landbank',              type: 'bank',    color: '#22c55e', group: 'Banks'        },
  { name: 'PNB',                   type: 'bank',    color: '#6366f1', group: 'Banks'        },
  { name: 'RCBC',                  type: 'bank',    color: '#ec4899', group: 'Banks'        },
  { name: 'EastWest',              type: 'bank',    color: '#06b6d4', group: 'Banks'        },
  { name: 'China Bank',            type: 'bank',    color: '#8b5cf6', group: 'Banks'        },
  // Credit Cards
  { name: 'Maya Credit',           type: 'credit',  color: '#06b6d4', group: 'Credit Cards' },
  { name: 'BPI Credit',            type: 'credit',  color: '#ef4444', group: 'Credit Cards' },
  { name: 'BDO Credit',            type: 'credit',  color: '#2D9DFF', group: 'Credit Cards' },
  { name: 'Metrobank Credit',      type: 'credit',  color: '#f59e0b', group: 'Credit Cards' },
  { name: 'UnionBank Credit',      type: 'credit',  color: '#f97316', group: 'Credit Cards' },
  { name: 'Security Bank Credit',  type: 'credit',  color: '#10b981', group: 'Credit Cards' },
  { name: 'RCBC Credit',           type: 'credit',  color: '#8b5cf6', group: 'Credit Cards' },
  // Others
  { name: 'Savings Account',       type: 'bank',    color: '#10b981', group: 'Others'       },
  { name: 'Payroll Account',       type: 'bank',    color: '#6366f1', group: 'Others'       },
]

export const PH_GROUPS = ['E-Wallets', 'Banks', 'Credit Cards', 'Others']

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
