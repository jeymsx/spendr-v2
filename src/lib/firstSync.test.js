import { describe, it, expect } from 'vitest'
import { accountHasData, deviceStanding, firstSyncCopy, localOnlyDeltas } from './firstSync'

/**
 * The first sync between a device and an account.
 *
 * What went wrong on 2026-09-28, in one line: a laptop fresh out of setup
 * signed in to an account with four months of history, and because every row
 * setup had just written was "newer", the laptop's zeros replaced the
 * account's balances and budgets. These pin the decisions that now stand in
 * the way of that. See lib/firstSync.js.
 */

describe('deviceStanding', () => {
  const userId = 'u1'

  it('merges as always with the account this device last synced with', () => {
    expect(deviceStanding({ userId, mark: 'u1', syncedBefore: true })).toBe('known')
    expect(deviceStanding({ userId, mark: 'u1', syncedBefore: false })).toBe('known')
  })

  it('treats a device that synced before the mark existed as known', () => {
    // Every phone already signed in on the day this shipped.
    expect(deviceStanding({ userId, mark: null, syncedBefore: true })).toBe('backfill')
  })

  it('does not know a device fresh out of setup, or after Reset app', () => {
    // The laptop, exactly.
    expect(deviceStanding({ userId, mark: null, syncedBefore: false })).toBe('unknown')
    expect(deviceStanding({ userId, mark: undefined, syncedBefore: false })).toBe('unknown')
  })

  it('does not know a device that last synced with somebody else', () => {
    // Signed out of one account and into another: its lastSync is the other
    // account's, so it must not pass for known.
    expect(deviceStanding({ userId, mark: 'u2', syncedBefore: true })).toBe('unknown')
  })
})

describe('accountHasData', () => {
  it('counts entries or accounts', () => {
    expect(accountHasData({ transactions: 1079, accounts: 10 })).toBe(true)
    expect(accountHasData({ transactions: 0, accounts: 3 })).toBe(true)
    expect(accountHasData({ transactions: 5, accounts: 0 })).toBe(true)
  })

  it('calls a brand-new account empty, so its first device just uploads', () => {
    expect(accountHasData({ transactions: 0, accounts: 0 })).toBe(false)
  })
})

describe('localOnlyDeltas', () => {
  const remoteAccounts = new Set(['Cash', 'BPI'])

  it('adds back what this device\'s own entries did to shared accounts', () => {
    const txs = [
      { txId: 'a', type: 'expense', account: 'Cash', amount: 100 },
      { txId: 'b', type: 'inflow', account: 'BPI', amount: 2500 },
      { txId: 'c', type: 'expense', account: 'Cash', amount: 50.5 },
    ]
    const d = localOnlyDeltas(txs, new Set(), remoteAccounts)
    expect(d.get('Cash')).toBeCloseTo(-150.5)
    expect(d.get('BPI')).toBe(2500)
  })

  it('skips entries the account already has', () => {
    const txs = [
      { txId: 'on-server', type: 'expense', account: 'Cash', amount: 100 },
      { txId: 'mine', type: 'expense', account: 'Cash', amount: 30 },
    ]
    expect(localOnlyDeltas(txs, new Set(['on-server']), remoteAccounts).get('Cash')).toBe(-30)
  })

  it('leaves an account only this device has alone - its balance already counts them', () => {
    const txs = [{ txId: 'x', type: 'inflow', account: 'GCash', amount: 1000 }]
    expect(localOnlyDeltas(txs, new Set(), remoteAccounts).has('GCash')).toBe(false)
  })

  it('moves both legs of a transfer, and only the legs on shared accounts', () => {
    const both = [{ txId: 't', type: 'transfer', fromAccount: 'BPI', toAccount: 'Cash', amount: 500 }]
    const d = localOnlyDeltas(both, new Set(), remoteAccounts)
    expect(d.get('BPI')).toBe(-500)
    expect(d.get('Cash')).toBe(500)

    const half = [{ txId: 't', type: 'transfer', fromAccount: 'GCash', toAccount: 'Cash', amount: 500 }]
    const h = localOnlyDeltas(half, new Set(), remoteAccounts)
    expect(h.get('Cash')).toBe(500)
    expect(h.has('GCash')).toBe(false)
  })

  it('adds what ARRIVED on a transfer across currencies', () => {
    const txs = [{ txId: 't', type: 'transfer', fromAccount: 'BPI', toAccount: 'Cash', amount: 100, toAmount: 5600 }]
    const d = localOnlyDeltas(txs, new Set(), remoteAccounts)
    expect(d.get('BPI')).toBe(-100)
    expect(d.get('Cash')).toBe(5600)
  })
})

describe('firstSyncCopy', () => {
  it('a device fresh out of setup is told what it will lose, and offered no merge', () => {
    const c = firstSyncCopy({ remote: { transactions: 1079, accounts: 10 }, local: { transactions: 0 } })
    expect(c.body).toBe('It has 1,079 entries across 10 accounts.')
    expect(c.account).toBe('Replaces what you set up on this device.')
    expect(c.both).toBeNull()
  })

  it('a device with entries of its own is offered both, with the count', () => {
    const c = firstSyncCopy({ remote: { transactions: 1079, accounts: 10 }, local: { transactions: 12 } })
    expect(c.body).toBe('It has 1,079 entries across 10 accounts. This device has 12 entries of its own.')
    expect(c.account).toBe("Removes this device's 12 entries.")
    expect(c.both).toBe("Adds this device's 12 entries to your account.")
  })

  it('reads right in the singular and with no entries yet', () => {
    const c = firstSyncCopy({ remote: { transactions: 0, accounts: 1 }, local: { transactions: 1 } })
    expect(c.body).toBe('It has 1 account and no entries yet. This device has 1 entry of its own.')
  })
})
