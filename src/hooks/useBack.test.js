import { describe, expect, it } from 'vitest'
import { parentPath } from './useBack'

/**
 * Back with nothing behind it - a page opened from a notification, or a
 * reload - used to do nothing at all on most pages, because they called
 * navigate(-1) and there was no -1. They now go to the page above.
 */
describe('the page above, for a Back with no history', () => {
  it('is the path less its last part', () => {
    expect(parentPath('/settings/profile')).toBe('/settings')
    expect(parentPath('/accounts/4/edit')).toBe('/accounts/4')
    expect(parentPath('/accounts/new')).toBe('/accounts')
    expect(parentPath('/recurring/7/edit')).toBe('/recurring/7')
    expect(parentPath('/insights/forecast/settings')).toBe('/insights/forecast')
    expect(parentPath('/goals/2')).toBe('/goals')
  })

  it('is Home for a page one level down', () => {
    for (const p of ['/expense', '/inflow', '/transfer', '/debts', '/recurring', '/login']) {
      expect(parentPath(p), p).toBe('/')
    }
  })

  it('knows the pages whose parent is not in their address', () => {
    expect(parentPath('/transactions/12/edit')).toBe('/transactions')
    expect(parentPath('/debts/person/ana')).toBe('/debts')
    expect(parentPath('/categories/Food')).toBe('/budget')
  })
})
