import { describe, expect, it } from 'vitest'
import { canPullToSync } from './pullToSync'

describe('where pulling down syncs', () => {
  it('syncs on the screens that show your data', () => {
    for (const p of ['/', '/transactions', '/accounts', '/accounts/4', '/insights', '/insights/forecast',
      '/budget', '/categories/Food', '/debts', '/debts/person/ana', '/goals', '/goals/2', '/recurring',
      '/recurring/7', '/notifications', '/achievements', '/transactions/deleted', '/recap']) {
      expect(canPullToSync(p), p).toBe(true)
    }
  })

  it('does not sync on New account, or any form that makes or edits something', () => {
    for (const p of ['/accounts/new', '/accounts/4/edit', '/expense', '/inflow', '/transfer',
      '/transactions/12/edit', '/recurring/new', '/recurring/7/edit', '/import']) {
      expect(canPullToSync(p), p).toBe(false)
    }
  })

  it('does not sync on settings pages', () => {
    for (const p of ['/settings', '/settings/profile', '/settings/categories', '/settings/sync', '/insights/forecast/settings']) {
      expect(canPullToSync(p), p).toBe(false)
    }
  })
})
