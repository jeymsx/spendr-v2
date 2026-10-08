// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

/**
 * The category form: what it offers, and what it hands to the database.
 *
 * Mounted shallow, as the smoke tests are: the contexts are mocked and the
 * writes are captured rather than run. What is pinned is the form's own
 * decisions - an inflow category has no budget field and saves a budget of
 * zero, the colour row says "Colour", a delete asks what to do with everything
 * that still uses the category - not Dexie, which categoryRefs.test.js covers.
 */

const add = vi.fn(async () => 1)
const metaGet = vi.fn(async () => undefined)
vi.mock('../../db/db', () => ({
  default: { categories: { add: (/** @type {any[]} */ ...a) => add(...a) }, meta: { get: (/** @type {any[]} */ ...a) => metaGet(...a) } },
  UNSYNCED: 0,
  SYNCED: 1,
  SYNCED_TABLES: [],
}))
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: () => {}, dismiss: () => {} }),
}))
vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', accentColor: '#2D9DFF' }),
  useIsDark: () => false,
}))
vi.mock('../../lib/sync', () => ({ deleteCategoryRemote: async () => {} }))

const saveCategoryEdit = vi.fn(async () => {})
const reassignAndDeleteCategory = vi.fn(async () => {})
/** @type {{ current: any }} */
const usage = { current: { transactions: 0, bills: 0, templates: 0, debts: 0, total: 0 } }
vi.mock('../../lib/categoryRefs', async (importOriginal) => ({
  ...(await importOriginal()),
  categoryUsage: async () => usage.current,
  saveCategoryEdit: (/** @type {any[]} */ ...a) => saveCategoryEdit(...a),
  reassignAndDeleteCategory: (/** @type {any[]} */ ...a) => reassignAndDeleteCategory(...a),
}))

const { CategoryFormSheet } = await import('./CategoryForm')

const FOOD = { id: 1, name: 'Food', type: 'expense', budget: 8000, color: '#ef4444', icon: '🍔' }
const SALARY = { id: 2, name: 'Salary', type: 'inflow', budget: 50000, color: '#10b981', icon: '💰' }
const GROCERIES = { id: 3, name: 'Groceries', type: 'expense', budget: 0 }

/** @param {Record<string, any>} props */
const form = (props = {}) => (
  <CategoryFormSheet open onClose={() => {}} allCategories={[FOOD, SALARY, GROCERIES]} {...props} />
)

beforeEach(() => {
  add.mockClear(); saveCategoryEdit.mockClear(); reassignAndDeleteCategory.mockClear()
  // mockClear leaves an implementation set by an earlier test in place.
  metaGet.mockReset()
  metaGet.mockResolvedValue(undefined)
  usage.current = { transactions: 0, bills: 0, templates: 0, debts: 0, total: 0 }
})
afterEach(cleanup)

describe('the budget field', () => {
  it('is offered for an expense category', () => {
    render(form({ defaultType: 'expense' }))
    expect(screen.getByLabelText('Monthly budget')).toBeTruthy()
  })

  /** The bug: an inflow category could be given a limit, and it counted in every total. */
  it('is not offered for an inflow category', () => {
    render(form({ defaultType: 'inflow' }))
    expect(screen.queryByLabelText('Monthly budget')).toBeNull()
    expect(screen.queryByText('Monthly budget')).toBeNull()
  })

  it('goes away when a new category is switched to inflow, and comes back', () => {
    render(form({ defaultType: 'expense' }))
    fireEvent.click(screen.getByText('↓ Inflow'))
    expect(screen.queryByLabelText('Monthly budget')).toBeNull()
    fireEvent.click(screen.getByText('↑ Expense'))
    expect(screen.getByLabelText('Monthly budget')).toBeTruthy()
  })
})

describe('saving', () => {
  it('saves a budget of zero for an inflow category, whatever was typed before it was one', async () => {
    render(form({ defaultType: 'expense' }))
    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Bonus' } })
    fireEvent.change(screen.getByLabelText('Monthly budget'), { target: { value: '3000' } })
    fireEvent.click(screen.getByText('↓ Inflow'))
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    expect(add.mock.calls[0][0]).toMatchObject({ name: 'Bonus', type: 'inflow', budget: 0 })
  })

  /** Editing an old inflow category heals the stray budget it was saved with. */
  it('writes zero over the stray budget an inflow category already holds', async () => {
    render(form({ category: SALARY }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(saveCategoryEdit).toHaveBeenCalled())
    expect(saveCategoryEdit.mock.calls[0]).toEqual([2, 'Salary', expect.objectContaining({ type: 'inflow', budget: 0 })])
  })

  it('saves the limit of an expense category, and starts a rolling one carrying from this month', async () => {
    metaGet.mockResolvedValue(/** @type {any} */ ({ key: 'budgetRollover', value: true }))
    render(form({ defaultType: 'expense' }))
    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Coffee' } })
    fireEvent.change(screen.getByLabelText('Monthly budget'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    const row = add.mock.calls[0][0]
    expect(row).toMatchObject({ name: 'Coffee', type: 'expense', budget: 1500 })
    expect(row.rolloverFrom).toMatch(/^\d{4}-\d{2}$/)
  })

  it('does not stamp a start for a category that does not roll', async () => {
    render(form({ defaultType: 'expense' }))
    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Coffee' } })
    fireEvent.change(screen.getByLabelText('Monthly budget'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    await waitFor(() => expect(add).toHaveBeenCalled())
    expect('rolloverFrom' in add.mock.calls[0][0]).toBe(false)
  })

  it('hands a rename to the one writer that carries it to bills, templates and debts', async () => {
    render(form({ category: FOOD }))
    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Eating out' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(saveCategoryEdit).toHaveBeenCalled())
    expect(saveCategoryEdit.mock.calls[0]).toEqual([1, 'Food', expect.objectContaining({ name: 'Eating out', budget: 8000 })])
  })
})

describe('the colour row', () => {
  /** The app spells it Colour everywhere else. */
  it('is headed Colour', () => {
    render(form({ defaultType: 'expense' }))
    expect(screen.getByText('Colour')).toBeTruthy()
    expect(screen.queryByText('Color')).toBeNull()
  })
})

describe('deleting', () => {
  it('goes straight to the confirmation when nothing uses the category', async () => {
    render(form({ category: GROCERIES, startAtDelete: true }))
    expect(await screen.findByText('Permanently delete this category?')).toBeTruthy()
  })

  /** A bill alone used to be missed: the check counted transactions only. */
  it('asks for a replacement when only a bill uses it, and says so', async () => {
    usage.current = { transactions: 0, bills: 1, templates: 0, debts: 0, total: 1 }
    render(form({ category: FOOD, startAtDelete: true }))
    expect(await screen.findByText('1 bill uses this category')).toBeTruthy()
    expect(screen.queryByText('Permanently delete this category?')).toBeNull()
  })

  it('says what it always said for transactions alone', async () => {
    usage.current = { transactions: 12, bills: 0, templates: 0, debts: 0, total: 12 }
    render(form({ category: FOOD, startAtDelete: true }))
    expect(await screen.findByText('12 transactions use this category')).toBeTruthy()
  })

  it('moves everything to the chosen category and deletes, through the one writer', async () => {
    usage.current = { transactions: 3, bills: 2, templates: 0, debts: 0, total: 5 }
    render(form({ category: FOOD, startAtDelete: true }))
    expect(await screen.findByText('3 transactions and 2 bills use this category')).toBeTruthy()
    // The row in the list of replacements, not the "Groceries" it is about to say in the header.
    fireEvent.click(screen.getByRole('button', { name: /Groceries/ }))
    fireEvent.click(screen.getByRole('button', { name: /Reassign & delete/ }))
    await waitFor(() => expect(reassignAndDeleteCategory).toHaveBeenCalled())
    expect(reassignAndDeleteCategory.mock.calls[0]).toEqual([FOOD, 'Groceries'])
  })
})
