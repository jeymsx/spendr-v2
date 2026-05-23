import db from '../db/db'

export async function syncToSheets(url) {
  const [transactions, accounts] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
  ])

  // Build outstanding balance map for credit accounts from transactions
  const creditOutstanding = {}
  for (const tx of transactions) {
    if (tx.type === 'expense' && tx.account) {
      creditOutstanding[tx.account] = (creditOutstanding[tx.account] ?? 0) + (tx.amount ?? 0)
    }
    if (tx.type === 'transfer' && tx.toAccount) {
      const toAcct = accounts.find(a => a.name === tx.toAccount)
      if (toAcct?.type === 'credit') {
        creditOutstanding[tx.toAccount] = (creditOutstanding[tx.toAccount] ?? 0) - (tx.amount ?? 0)
      }
    }
  }

  const txRows = transactions.map(tx => ({
    date:        tx.date        || '',
    description: tx.description || '',
    type:        tx.type        || '',
    category:    tx.category    || '',
    amount:      tx.amount      ?? 0,
    account:     tx.type === 'transfer'
                   ? (tx.fromAccount || tx.account || '')
                   : (tx.account     || ''),
    toAccount:   tx.toAccount   || '',
    currency:    tx.currency    || 'PHP',
  }))

  const accountRows = accounts.map(a => {
    const isCredit = a.type === 'credit'
    const balance  = isCredit
      ? Math.max(0, (a.creditLimit ?? 0) - Math.max(0, creditOutstanding[a.name] ?? 0))
      : (a.balance ?? 0)
    return {
      name:        a.name,
      type:        a.type        || '',
      role:        a.role        || '',
      balance,
      balanceType: isCredit ? 'Available Credit' : 'Balance',
      creditLimit: isCredit ? (a.creditLimit ?? 0) : null,
      currency:    a.currency    || 'PHP',
    }
  })

  const res = await fetch(url, {
    method:   'POST',
    redirect: 'follow',
    headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
    body:     JSON.stringify({ transactions: txRows, accounts: accountRows }),
  })

  if (!res.ok) throw new Error(`Server returned ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Sync failed')

  return { txCount: txRows.length, accountCount: accountRows.length }
}
