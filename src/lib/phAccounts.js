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
  { name: 'MariBank',            type: 'bank',    color: '#2D9DFF', group: 'Digital Banks',     popular: false },
  { name: 'Tonik',              type: 'bank',    color: '#8b5cf6', group: 'Digital Banks',     popular: false },
  { name: 'UNO Digital Bank',   type: 'bank',    color: '#f59e0b', group: 'Digital Banks',     popular: false },
  { name: 'OwnBank',            type: 'bank',    color: '#10b981', group: 'Digital Banks',     popular: false },
  { name: 'ING',                type: 'bank',    color: '#f97316', group: 'Digital Banks',     popular: false },
  /* Citi's Philippine consumer cards moved to UnionBank in 2022, so a card
     opened today is a UnionBank one - which is what this offers in Citibank's
     place. Named "UnionBank Credit Card" and not "UnionBank" because the bank
     itself is a preset above and account names are unique; accountBrands'
     logo lookup drops the product words, so it still finds unionbank.svg. */
  { name: 'UnionBank Credit Card', type: 'credit', color: '#f97316', group: 'Traditional Banks',    popular: false },
  { name: 'HSBC',               type: 'credit',  color: '#ef4444', group: 'Traditional Banks',      popular: false },
]

/**
 * Presets no picker offers any more, kept for the accounts already made from
 * them. Their logo still comes through accountBrands' name lookup
 * (citibank.svg); what this keeps is the house colour, which the edit form
 * finds by name to offer back (AccountForm's presetColor).
 */
export const PH_RETIRED_ACCOUNTS = [
  { name: 'Citibank',           type: 'credit',  color: '#2D9DFF', group: 'Traditional Banks',      popular: false },
]

export const PH_GROUPS = ['E-Wallets', 'Traditional Banks', 'Digital Banks']

/**
 * Investments and loans people in the Philippines commonly hold, for the new
 * account page's grid. A list of its own rather than more rows above: the
 * onboarding and quick-add pickers read PH_ACCOUNTS and create accounts from
 * a single opening balance, which is not how either of these starts - an
 * investment is valued, and a loan is owed. Only AccountNew offers them,
 * through its Investments and Loans filters.
 */
/* A bank's fund or loan takes the bank's colour from PH_ACCOUNTS above, and
   its logo comes through accountBrands' name lookup ("Metrobank UITF" finds
   metrobank.svg), so the tile is recognisably that bank's. No crypto, by the
   owner's call. */
export const PH_HOLDINGS = [
  // Government and pooled funds
  { name: 'Pag-IBIG MP2',           type: 'investment', kind: 'mp2',      color: '#0ea5e9', group: 'Investments' },
  { name: 'BPI UITF',               type: 'investment', kind: 'fund',     color: '#ef4444', group: 'Investments' },
  { name: 'BDO UITF',               type: 'investment', kind: 'fund',     color: '#2D9DFF', group: 'Investments' },
  { name: 'Metrobank UITF',         type: 'investment', kind: 'fund',     color: '#f59e0b', group: 'Investments' },
  { name: 'Security Bank UITF',     type: 'investment', kind: 'fund',     color: '#10b981', group: 'Investments' },
  { name: 'Landbank UITF',          type: 'investment', kind: 'fund',     color: '#22c55e', group: 'Investments' },
  { name: 'RCBC UITF',              type: 'investment', kind: 'fund',     color: '#ec4899', group: 'Investments' },
  { name: 'Sun Life Funds',         type: 'investment', kind: 'fund',     color: '#f59e0b', group: 'Investments' },
  { name: 'GInvest',                type: 'investment', kind: 'fund',     color: '#2D9DFF', group: 'Investments' },
  // Stocks, through a broker
  { name: 'COL Financial',          type: 'investment', kind: 'stocks',   color: '#1d4ed8', group: 'Investments' },
  { name: 'BPI Trade',              type: 'investment', kind: 'stocks',   color: '#ef4444', group: 'Investments' },
  { name: 'FirstMetroSec',          type: 'investment', kind: 'stocks',   color: '#1e3a8a', group: 'Investments' },
  { name: 'Philstocks',             type: 'investment', kind: 'stocks',   color: '#0891b2', group: 'Investments' },
  // Fixed income and retirement
  { name: 'Retail Treasury Bonds',  type: 'investment', kind: 'bonds',    color: '#0f766e', group: 'Investments' },
  { name: 'Time Deposit',           type: 'investment', kind: 'deposit',  color: '#10b981', group: 'Investments' },
  { name: 'PERA',                   type: 'investment', kind: 'pera',     color: '#7c3aed', group: 'Investments' },
  { name: 'VUL',                    type: 'investment', kind: 'vul',      color: '#8b5cf6', group: 'Investments' },
  // Things you own
  { name: 'Gold',                   type: 'investment', kind: 'gold',     color: '#ca8a04', group: 'Investments' },
  { name: 'Real Estate',            type: 'investment', kind: 'property', color: '#b45309', group: 'Investments' },
  { name: 'Business',               type: 'investment', kind: 'business', color: '#475569', group: 'Investments' },

  // Government
  { name: 'Pag-IBIG Housing Loan',  type: 'loan', color: '#0ea5e9', group: 'Loans' },
  { name: 'Pag-IBIG Salary Loan',   type: 'loan', color: '#0284c7', group: 'Loans' },
  { name: 'Pag-IBIG Calamity Loan', type: 'loan', color: '#0369a1', group: 'Loans' },
  { name: 'SSS Salary Loan',        type: 'loan', color: '#1e40af', group: 'Loans' },
  { name: 'SSS Calamity Loan',      type: 'loan', color: '#1e3a8a', group: 'Loans' },
  { name: 'GSIS Loan',              type: 'loan', color: '#0f766e', group: 'Loans' },
  // Banks and lenders
  { name: 'Home Loan',              type: 'loan', color: '#b45309', group: 'Loans' },
  { name: 'Car Loan',               type: 'loan', color: '#64748b', group: 'Loans' },
  { name: 'Motorcycle Loan',        type: 'loan', color: '#dc2626', group: 'Loans' },
  { name: 'Personal Loan',          type: 'loan', color: '#f97316', group: 'Loans' },
  { name: 'GCash GLoan',            type: 'loan', color: '#2D9DFF', group: 'Loans' },
  { name: 'Maya Personal Loan',     type: 'loan', color: '#06b6d4', group: 'Loans' },
  { name: 'Home Credit',            type: 'loan', color: '#e11d48', group: 'Loans' },
  // Money owed on a schedule to someone who is not a lender
  { name: 'Company Loan',           type: 'loan', color: '#475569', group: 'Loans' },
  { name: 'Student Loan',           type: 'loan', color: '#7c3aed', group: 'Loans' },
]

export const POPULAR_ACCOUNTS = PH_ACCOUNTS.filter(a => a.popular)

// TYPE_ICON moved to components/icons.jsx as ACCOUNT_TYPE_ICON. Which glyph
// stands for "savings" is presentation, and this file is data.

export const CUSTOM_PALETTE = [
  '#10b981', '#2D9DFF', '#8b5cf6', '#f59e0b', '#ef4444',
  '#f97316', '#ec4899', '#06b6d4', '#6366f1', '#22c55e',
]
