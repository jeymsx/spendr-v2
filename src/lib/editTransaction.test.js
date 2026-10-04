import { describe, it, expect, vi } from 'vitest'
import { editTransaction, handleEditTransaction } from './editTransaction'

describe('editTransaction', () => {
  it('goes to the edit page with nothing to open it in place - the phone', () => {
    const navigate = vi.fn()
    const close = vi.fn()
    editTransaction(navigate, { id: 7 }, close)
    expect(navigate).toHaveBeenCalledWith('/transactions/7/edit')
    expect(close).not.toHaveBeenCalled()
  })

  it('opens it in place when the desktop has said how, closing the sheet first', () => {
    const open = vi.fn()
    const navigate = vi.fn()
    const close = vi.fn()
    const stop = handleEditTransaction(open)
    editTransaction(navigate, { id: 7 }, close)
    expect(close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith(7)
    expect(navigate).not.toHaveBeenCalled()
    stop()
    editTransaction(navigate, { id: 8 })
    expect(navigate).toHaveBeenCalledWith('/transactions/8/edit')
  })

  it('leaves a newer handler in place when an older one is taken away', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = handleEditTransaction(first)
    const stopSecond = handleEditTransaction(second)
    stopFirst()
    editTransaction(vi.fn(), { id: 3 })
    expect(second).toHaveBeenCalledWith(3)
    stopSecond()
  })

  it('does nothing for a row with no id', () => {
    const navigate = vi.fn()
    editTransaction(navigate, {})
    expect(navigate).not.toHaveBeenCalled()
  })
})
