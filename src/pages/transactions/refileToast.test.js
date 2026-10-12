import { describe, it, expect, vi, beforeEach } from 'vitest'

/** The ledger as the offer finds it when taken, by id. */
const h = vi.hoisted(() => ({
  rows: /** @type {Map<number, Record<string, any>>} */ (new Map()),
  recategorize: vi.fn(),
  refile: vi.fn(async () => {}),
}))

vi.mock('../../db/db', () => ({
  default: { transactions: { bulkGet: async (/** @type {number[]} */ ids) => ids.map(id => h.rows.get(id)) } },
}))
vi.mock('../../db/txHelpers', () => ({ recategorize: h.recategorize, refile: h.refile }))

const { announceRefile } = await import('./refileToast')

const toasts = () => {
  /** @type {Array<{message: string, type?: string, options?: Record<string, any>}>} */
  const said = []
  const show = vi.fn((message, type, options) => { said.push({ message, type, options }) })
  return { said, show }
}

beforeEach(() => {
  h.rows.clear()
  h.recategorize.mockReset()
  h.recategorize.mockImplementation(async (/** @type {any[]} */ txs) => txs.map(t => ({ id: t.id, category: t.category })))
  h.refile.mockClear()
})

describe('announceRefile', () => {
  const before = [{ id: 1, category: 'Shopping' }]

  it('offers Undo when nothing else is like it', () => {
    const { said, show } = toasts()
    announceRefile(show, { message: 'Filed under Food', before, category: 'Food', from: 'Shopping', tag: 't' })
    expect(said).toHaveLength(1)
    expect(said[0].message).toBe('Filed under Food')
    said[0].options?.onAction()
    expect(h.refile).toHaveBeenCalledWith(before)
  })

  it('offers to move the others, and its Undo puts all of them back', async () => {
    const others = [{ id: 2, category: 'Shopping' }, { id: 3, category: 'Shopping' }]
    for (const o of others) h.rows.set(o.id, { ...o })
    const { said, show } = toasts()
    announceRefile(show, { message: 'Filed under Food', before, category: 'Food', from: 'Shopping', others, tag: 't' })
    expect(said[0].message).toBe('Filed under Food')
    expect(said[0].options?.actionLabel).toBe('Move 2 more')

    await said[0].options?.onAction()
    expect(h.recategorize).toHaveBeenCalledWith([{ id: 2, category: 'Shopping' }, { id: 3, category: 'Shopping' }], 'Food')
    expect(said[1].message).toBe('3 filed under Food')
    said[1].options?.onAction()
    expect(h.refile).toHaveBeenCalledWith([...before, { id: 2, category: 'Shopping' }, { id: 3, category: 'Shopping' }])
  })

  it('leaves a row that was refiled or deleted before the offer was taken', async () => {
    const others = [{ id: 2, category: 'Shopping' }, { id: 3, category: 'Shopping' }, { id: 4, category: 'Shopping' }]
    h.rows.set(2, { id: 2, category: 'Shopping' })
    h.rows.set(3, { id: 3, category: 'Bills' })  // moved by hand meanwhile; 4 was deleted
    const { said, show } = toasts()
    announceRefile(show, { message: 'Filed under Food', before, category: 'Food', from: 'Shopping', others, tag: 't' })
    await said[0].options?.onAction()
    expect(h.recategorize).toHaveBeenCalledWith([{ id: 2, category: 'Shopping' }], 'Food')
    expect(said[1].message).toBe('2 filed under Food')
  })

  it('says so when moving the others fails', async () => {
    h.rows.set(2, { id: 2, category: 'Shopping' })
    h.recategorize.mockRejectedValueOnce(new Error('quota'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { said, show } = toasts()
    announceRefile(show, { message: 'Filed under Food', before, category: 'Food', from: 'Shopping', others: [{ id: 2 }], tag: 't' })
    await said[0].options?.onAction()
    expect(said[1]).toMatchObject({ message: 'Could not move the others', type: 'error' })
    err.mockRestore()
  })
})
