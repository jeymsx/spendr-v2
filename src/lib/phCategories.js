export const CAT_PALETTE = [
  '#2D9DFF', '#FF6B6B', '#FFB347', '#51CF66', '#845EF7',
  '#FF8CC8', '#20C997', '#FCC419', '#74C0FC', '#F06595',
]

// Shown as locked pre-selected chips in each grid
export const LOCKED_EXPENSE = { name: 'Others',  icon: '📦', color: '#6b7280', type: 'expense' }
export const LOCKED_INFLOW  = { name: 'Income',  icon: '💰', color: '#22c55e', type: 'inflow'  }

// Always seeded silently (not shown in grids)
export const SYSTEM_CATS = [
  { name: 'Others',       icon: '📦', color: '#6b7280', type: 'expense'  },
  { name: 'Income',       icon: '💰', color: '#22c55e', type: 'inflow'   },
  { name: 'Transfer',     icon: '🔄', color: '#2D9DFF', type: 'transfer' },
  { name: 'Transfer Fee', icon: '💸', color: '#f59e0b', type: 'expense'  },
]

export const EXPENSE_PRESETS = [
  { name: 'Food',          icon: '🍔', color: '#FFB347', type: 'expense' },
  { name: 'Shopping',      icon: '🛍️', color: '#FF8CC8', type: 'expense' },
  { name: 'Transpo',       icon: '🚗', color: '#2D9DFF', type: 'expense' },
  { name: 'Bills',         icon: '🧾', color: '#FF6B6B', type: 'expense' },
  { name: 'Entertainment', icon: '🎮', color: '#845EF7', type: 'expense' },
  { name: 'Personal',      icon: '💆', color: '#20C997', type: 'expense' },
  { name: 'Rent',          icon: '🏠', color: '#FCC419', type: 'expense' },
  { name: 'Health',        icon: '💊', color: '#51CF66', type: 'expense' },
  { name: 'Education',     icon: '🎓', color: '#74C0FC', type: 'expense' },
  { name: 'Travel',        icon: '✈️', color: '#F06595', type: 'expense' },
  { name: 'Pets',          icon: '🐾', color: '#FFB347', type: 'expense' },
  { name: 'Tech',          icon: '💻', color: '#2D9DFF', type: 'expense' },
  { name: 'Gifts',         icon: '🎁', color: '#FF8CC8', type: 'expense' },
  { name: 'Repairs',       icon: '🔧', color: '#FCC419', type: 'expense' },
  { name: 'Fitness',       icon: '🏋️', color: '#51CF66', type: 'expense' },
  { name: 'Dining Out',    icon: '🍷', color: '#FF6B6B', type: 'expense' },
  { name: 'Clothing',      icon: '👗', color: '#F06595', type: 'expense' },
  { name: 'Groceries',     icon: '🧴', color: '#20C997', type: 'expense' },
  { name: 'Subscriptions', icon: '📱', color: '#845EF7', type: 'expense' },
  { name: 'Music',         icon: '🎵', color: '#74C0FC', type: 'expense' },
  { name: 'Baby/Kids',     icon: '🍼', color: '#FFB347', type: 'expense' },
  { name: 'Donations',     icon: '🙏', color: '#51CF66', type: 'expense' },
  { name: 'Vices',         icon: '🚬', color: '#FF6B6B', type: 'expense' },
  { name: 'Fees & Charges', icon: '⚠️', color: '#FF6B6B', type: 'expense' },
  { name: 'Card Interest', icon: '📉', color: '#F06595', type: 'expense' },
]

export const INFLOW_PRESETS = [
  { name: 'Salary',     icon: '💰', color: '#51CF66', type: 'inflow' },
  { name: 'Freelance',  icon: '💼', color: '#2D9DFF', type: 'inflow' },
  { name: 'Investment', icon: '📈', color: '#FCC419', type: 'inflow' },
  { name: 'Interest',   icon: '🏦', color: '#74C0FC', type: 'inflow' },
  { name: 'Gift Money', icon: '🎁', color: '#FF8CC8', type: 'inflow' },
  { name: 'Allowance',  icon: '💸', color: '#845EF7', type: 'inflow' },
  { name: 'Refund',     icon: '🔄', color: '#20C997', type: 'inflow' },
  { name: 'Bonus',      icon: '🏆', color: '#FFB347', type: 'inflow' },
  { name: 'Sold Item',  icon: '🛒', color: '#F06595', type: 'inflow' },
  { name: 'Dividends',  icon: '💹', color: '#51CF66', type: 'inflow' },
  { name: 'Others',     icon: '📦', color: '#6b7280', type: 'inflow' },
]

export const EMOJI_SUGGESTIONS = [
  '🍔', '🛍️', '🚗', '🧾', '🎮', '💆', '🏠', '💊',
  '🎓', '✈️', '🐾', '💻', '🎁', '🔧', '🏋️', '🍷',
  '👗', '🧴', '📱', '🎵', '🍼', '🙏', '🚬', '📦',
  '💎', '🎯', '⚽', '🎨', '📚', '🔑', '💡', '🚀',
  '🌿', '🛒', '🏆', '🌍', '🎲', '🎤', '💼', '📈',
]
