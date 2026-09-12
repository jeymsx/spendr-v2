import { useState, useEffect, useMemo } from 'react'
import db, { UNSYNCED } from '../../db/db'
import { useToast } from '../../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../../utils/moneyInput'
import { deleteCategoryRemote } from '../../lib/sync'
import CategoryGlyph, { presetCategoryIcon as CATEGORY_ICON_BY_NAME } from '../../components/CategoryGlyph'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import SectionLabel from '../../components/ui/SectionLabel'
import SwatchRail from '../../components/ui/SwatchRail'
import Field from '../../components/ui/Field'
import { IconWarning, IconCheck } from '../../components/icons'
import { CAT_COLORS, DEFAULT_CAT_NAMES, EMOJI_OPTIONS } from './shared'
import { fmt } from '../../lib/money'

// ── Category form sheet ────────────────────────────────────────────────────────

export function CategoryFormSheet({ open, onClose, category, defaultType, allCategories, startAtDelete, zIndex = 100 }) {
  const { showToast } = useToast()
  const [saving,         setSaving]         = useState(false)
  const [mode,           setMode]           = useState('form')
  const [txCount,        setTxCount]        = useState(0)
  const [reassignTarget, setReassignTarget] = useState(null)

  const [name,      setName]      = useState('')
  const [type,      setType]      = useState('expense')
  const [icon,      setIcon]      = useState('📦')
  const [color,     setColor]     = useState(CAT_COLORS[0])
  const [budget,    setBudget]    = useState('0')
  const [nameError, setNameError] = useState(false)

  const isEdit    = !!category?.id
  const isDefault = isEdit && DEFAULT_CAT_NAMES.has(category?.name)

  const reassignOptions = useMemo(() =>
    allCategories.filter(c => c.type === (category?.type ?? type) && c.id !== category?.id),
    [allCategories, category, type])

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false)
    setNameError(false)
    setReassignTarget(null)

    if (category?.id) {
      setName(category.name)
      setType(category.type ?? 'expense')
      setIcon(category.icon ?? '📦')
      setColor(category.color ?? CAT_COLORS[0])
      setBudget(numToMoneyStr(category.budget ?? 0))
      if (startAtDelete) runDeleteCheck()
      else setMode('form')
    } else {
      setName('')
      setType(defaultType ?? 'expense')
      setIcon('📦')
      setColor(CAT_COLORS[Math.floor(Math.random() * CAT_COLORS.length)])
      setBudget('0')
      setMode('form')
    }
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, startAtDelete])

  async function runDeleteCheck() {
    const count = await db.transactions.where('category').equals(category.name).count()
    setTxCount(count)
    setMode(count > 0 ? 'reassign' : 'confirm-delete')
  }

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const data = { name: name.trim(), type, icon, color, budget: parseMoney(budget) || 0 }
      if (isEdit) {
        const oldName = category.name
        const newName = data.name
        const renamedAt = new Date().toISOString()
        await db.transaction('rw', [db.categories, db.transactions], async () => {
          await db.categories.update(category.id, data)
          if (oldName !== newName) {
            await db.transactions.where('category').equals(oldName).modify({ category: newName, synced: UNSYNCED, updatedAt: renamedAt })
          }
        })
      } else {
        await db.categories.add(data)
      }
      close()
    } catch (e) {
      console.error('[CategoryForm] save failed:', e)
      showToast('Failed to save category', 'error')
      setSaving(false)
    }
  }

  async function handleDeleteDirect() {
    setSaving(true)
    try {
      await db.categories.delete(category.id)
      // Without this the next pull re-adds the category from Supabase.
      await deleteCategoryRemote(category.name, category.type)
      close()
    } catch (e) {
      console.error('[CategoryForm] delete failed:', e)
      showToast('Failed to delete category', 'error')
      setSaving(false)
    }
  }

  async function handleReassignAndDelete() {
    if (!reassignTarget) return
    setSaving(true)
    try {
      await db.transaction('rw', [db.categories, db.transactions], async () => {
        await db.transactions.where('category').equals(category.name).modify({ category: reassignTarget.name })
        await db.categories.delete(category.id)
      })
      await deleteCategoryRemote(category.name, category.type)
      close()
    } catch (e) {
      console.error('[CategoryForm] reassign+delete failed:', e)
      showToast('Failed to delete category', 'error')
      setSaving(false)
    }
  }

  const sheetTitle = {
    form:             isEdit ? 'Edit Category' : 'New Category',
    'confirm-delete': 'Delete Category',
    reassign:         'Reassign Transactions',
  }[mode]

  /* One action row per mode, pinned by Sheet under the scrolling body.

     They used to be the last thing inside each mode's block, so on a short
     screen you scrolled past the icon grid to reach Save. And the header was
     a sticky opaque bar with a border under it, which clipped the rows
     passing beneath it on a hard straight line - the thing FadeScroller
     exists to avoid, and which every sheet on the primitive now gets. */
  const footer = {
    form: (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button className="flex-[2]" onClick={handleSave} loading={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add category'}
        </Button>
      </div>
    ),
    'confirm-delete': (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setMode('form')} disabled={saving}>
          Keep it
        </Button>
        <Button variant="danger" className="flex-[2]" onClick={handleDeleteDirect} loading={saving}>
          {saving ? 'Deleting…' : 'Delete category'}
        </Button>
      </div>
    ),
    reassign: (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setMode('form')} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="danger"
          className="flex-[2]"
          onClick={handleReassignAndDelete}
          loading={saving}
          disabled={!reassignTarget || reassignOptions.length === 0}
        >
          {saving ? 'Moving…' : 'Reassign & delete'}
        </Button>
      </div>
    ),
  }[mode]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={zIndex}
      dismissible={!saving}
      title={sheetTitle}
      titleAction={mode === 'form' && isEdit ? (
        <Button variant="dangerTint" size="sm" className="px-4" onClick={runDeleteCheck}>
          Delete
        </Button>
      ) : null}
      footer={footer}
    >
      <div>

        {/* Form mode */}
        {mode === 'form' && (
          <div className="pt-5 pb-2 flex flex-col gap-5">
            <Field
              label="Category name"
              value={name}
              onChange={e => { setName(e.target.value); setNameError(false) }}
              placeholder="e.g. Groceries"
              maxLength={30}
              error={nameError ? 'Name is required' : null}
            />

            <div>
              <SectionLabel>Type</SectionLabel>
              {isEdit ? (
                <p className="h-[48px] flex items-center px-4 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-300
                  bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.09]">
                  {type === 'expense' ? '↑ Expense' : '↓ Inflow'}
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">(cannot change)</span>
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[{ value: 'expense', label: '↑ Expense' }, { value: 'inflow', label: '↓ Inflow' }].map(o => (
                    <button key={o.value} onClick={() => setType(o.value)}
                      className={[
                        'py-3 rounded-full text-sm font-semibold transition-all duration-75 active:scale-[0.97]',
                        type === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-500 dark:text-slate-400',
                      ].join(' ')}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <SectionLabel>Icon</SectionLabel>
              {/* Worth saying out loud, because the preview below now shows
                  the real thing and the two will disagree: a preset name has
                  a drawn icon, and the emoji is what a custom name gets. */}
              {CATEGORY_ICON_BY_NAME({ name: name.trim() }) && (
                <p className="-mt-1 mb-2 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                  “{name.trim()}” has its own icon, so it keeps that whichever
                  you pick here.
                </p>
              )}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
                <div className="grid grid-cols-8 gap-1.5">
                  {EMOJI_OPTIONS.map(e => (
                    <button key={e} onClick={() => setIcon(e)}
                      className={[
                        'h-10 rounded-xl flex items-center justify-center text-[20px]',
                        'active:scale-90 transition-all duration-75',
                        icon === e
                          ? 'bg-primary/[0.12] ring-2 ring-primary/40'
                          : 'hover:bg-white dark:hover:bg-white/[0.06]',
                      ].join(' ')}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              {/* The same rail the card designer uses. This was eight rounded
                  rectangles stretched to fill the row and ticked with a white
                  check - the same job as the card's colour row, drawn as a
                  different object two screens away. */}
              <SectionLabel>Color</SectionLabel>
              <SwatchRail
                colors={CAT_COLORS}
                value={color}
                onChange={setColor}
                ariaLabel="Category colour"
              />
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl
              bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.07]">
              {/* The glyph this category will really have.

                  CategoryGlyph reads the NAME: a preset name resolves to an
                  SVG and anything else keeps the emoji. Printing the emoji
                  here made the preview disagree with every other screen -
                  type "Food" and the preview showed a box while the
                  transaction list showed a fork and knife. Passing the draft
                  as a category gets both cases right, including the one where
                  the emoji is the answer. */}
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: color + '22' }}>
                <CategoryGlyph cat={{ name: name.trim(), color, icon }} size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{name || 'Category Name'}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {type === 'expense' ? 'Expense' : 'Inflow'}
                  {parseMoney(budget) > 0 && ` · ${fmt(parseMoney(budget))} / mo`}
                </p>
              </div>
            </div>

            <Field
              label="Monthly budget"
              type="text"
              inputMode="decimal"
              value={budget === '0' ? '' : budget}
              onChange={moneyChangeHandler(setBudget)}
              left="₱"
              placeholder="0.00"
              /* "Optional — 0 means no budget" was the placeholder, which is
                 three jobs for one line: what goes in the box, that the box is
                 optional, and what zero does. A placeholder can only do the
                 first, and it vanishes the moment you type - which is when the
                 other two still matter. They are the hint now. */
              hint={parseMoney(budget) > 0
                ? `Spending alerts when you approach ${fmt(parseMoney(budget))} this month`
                : 'Optional. Leave empty for no budget.'}
            />

          </div>
        )}

        {/* Confirm delete */}
        {mode === 'confirm-delete' && (
          <div className="pt-6 pb-2">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: (category?.color ?? '#2D9DFF') + '22' }}>
                <CategoryGlyph cat={category} size={24} />
              </div>
              <p className="text-base font-semibold text-slate-800 dark:text-white">{category?.name}</p>
            </div>
            {isDefault && (
              <div className="mb-5 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Default category</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                  This is a built-in Spendr category. Deleting it is permanent.
                </p>
              </div>
            )}
            <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-1">Permanently delete this category?</p>
            <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-7">No transactions are using it. This cannot be undone.</p>
          </div>
        )}

        {/* Reassign mode */}
        {mode === 'reassign' && (
          <div className="pt-5 pb-2">
            <div className="flex items-start gap-3 px-4 py-3.5 mb-5 rounded-2xl
              bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
              <span className="shrink-0 mt-0.5 text-amber-500 dark:text-amber-400"><IconWarning size={20} /></span>
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {txCount} {txCount === 1 ? 'transaction uses' : 'transactions use'} this category
                </p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                  Choose a replacement before deleting.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-5 px-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 flex-1 min-w-0">
                <span className="shrink-0"><CategoryGlyph cat={category} size={16} /></span>
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 truncate">{category?.name}</p>
              </div>
              <span className="text-slate-400 dark:text-slate-500 shrink-0 text-sm">→</span>
              <div className={[
                'flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 min-w-0',
                reassignTarget
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20'
                  : 'bg-slate-50 dark:bg-white/[0.04] border-slate-100 dark:border-white/[0.07]',
              ].join(' ')}>
                {reassignTarget ? (
                  <>
                    <span className="text-base shrink-0">{reassignTarget.icon}</span>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">{reassignTarget.name}</p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Pick below</p>
                )}
              </div>
            </div>

            <SectionLabel>Reassign to</SectionLabel>
            {reassignOptions.length === 0 ? (
              <div className="py-6 text-center rounded-2xl bg-slate-50 dark:bg-white/[0.04] mb-5">
                <p className="text-sm text-slate-400 dark:text-slate-500">No other categories available</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mb-5">
                {reassignOptions.map(cat => (
                  <button key={cat.id} onClick={() => setReassignTarget(cat)}
                    className={[
                      'flex items-center gap-3 px-4 py-3 rounded-2xl text-left',
                      'active:scale-[0.98] transition-all duration-75',
                      reassignTarget?.id === cat.id
                        ? 'ring-2 ring-primary/40 bg-primary/[0.06] dark:bg-primary/[0.12]'
                        : 'bg-slate-50 dark:bg-white/[0.04] active:bg-slate-100 dark:active:bg-white/[0.08]',
                    ].join(' ')}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (cat.color ?? '#2D9DFF') + '22' }}>
                      <CategoryGlyph cat={cat} size={18} />
                    </div>
                    <p className="flex-1 text-sm font-semibold text-slate-800 dark:text-white truncate">{cat.name}</p>
                    {reassignTarget?.id === cat.id && (
                      <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <IconCheck size={13} strokeWidth="3" stroke="white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    </Sheet>
  )
}
