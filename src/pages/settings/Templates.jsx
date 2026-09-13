/**
 * Quick templates: the list, the editor, and the page they live on.
 *
 * Lifted out of Settings.jsx unchanged. It is a self-contained feature - a row,
 * a form sheet, a manager, and the two shells that present the manager as
 * either a sheet or a page - and it had no business sharing a file with the
 * accent picker and the privacy policy.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import db from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { useCreditAvailMap } from '../../hooks/useCreditAvailMap'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../../utils/moneyInput'
import { deleteTemplateRemote } from '../../lib/sync'
import SubPage from '../../components/SubPage'
import AccountPickerSheet from '../../components/AccountPickerSheet'
import AccountSelectRow from '../../components/AccountSelectRow'
import CategoryPickerSheet from '../../components/CategoryPickerSheet'
import CategoryRail from '../../components/CategoryRail'
import CategoryGlyph from '../../components/CategoryGlyph'
import {
  IconChevronRight, IconPlus, IconTemplate, IconTransferUI, IconArrowDown,
} from '../../components/icons'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import Divider from '../../components/ui/Divider'
import SectionLabel from '../../components/ui/SectionLabel'
import IconButton from '../../components/ui/IconButton'
import { fieldFrame } from '../../components/ui/Field'
import { fmt } from '../../lib/money'

// ── Template row ───────────────────────────────────────────────────────────────

export const TMPL_TYPE_STYLE = {
  expense:  { bg: 'bg-red-50 dark:bg-red-500/10',      text: 'text-red-500 dark:text-red-400',      label: 'Expense'  },
  inflow:   { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', label: 'Inflow' },
  transfer: { bg: 'bg-blue-50 dark:bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400',    label: 'Transfer' },
}

export function TemplateRow({ tpl, cat, onTap, onLongPressDelete }) {
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const [pressed, setPressed] = useState(false)
  const ts = TMPL_TYPE_STYLE[tpl.type] ?? TMPL_TYPE_STYLE.expense

  const start = useCallback(() => {
    firedRef.current = false; setPressed(true)
    timerRef.current = setTimeout(() => { firedRef.current = true; setPressed(false); onLongPressDelete(tpl) }, 550)
  }, [tpl, onLongPressDelete])
  const end = useCallback(() => {
    clearTimeout(timerRef.current); setPressed(false)
    if (!firedRef.current) onTap(tpl); firedRef.current = false
  }, [tpl, onTap])
  const cancel = useCallback(() => { clearTimeout(timerRef.current); setPressed(false); firedRef.current = false }, [])

  return (
    <div
      onPointerDown={start} onPointerUp={end} onPointerLeave={cancel} onPointerCancel={cancel}
      className={`flex items-center gap-3 px-4 py-3.5 select-none cursor-pointer transition-colors duration-75
        ${pressed ? 'bg-slate-50 dark:bg-white/[0.06]' : ''}`}
    >
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-18 shrink-0 ${ts.bg}`}>
        {tpl.type === 'transfer'
                        ? <IconTransferUI size={16} />
                        : <CategoryGlyph cat={cat} size={16} emoji="⚡" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{tpl.name}</p>
        <p className="text-11 text-slate-400 dark:text-slate-500 mt-0.5 truncate">
          {tpl.type === 'transfer' ? `${tpl.fromAccount} → ${tpl.toAccount}` : (tpl.account ?? '')}
        </p>
      </div>
      <p className={`text-sm font-bold tabular-nums shrink-0 ${ts.text}`}>{fmt(tpl.amount)}</p>
      <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight size={14} strokeWidth="2" /></span>
    </div>
  )
}

// ── Template form sheet ────────────────────────────────────────────────────────

export function TemplateFormSheet({ open, onClose, template, allAccounts, allCategories }) {
  const { showToast } = useToast()
  /* No `closing` flag and no scroll lock: this is a <Sheet>, which owns the
     overlay, the panel, the grab handle, the scroll lock, Escape, the focus
     trap and the 240ms exit, and `open` is the only thing that decides any
     of it. */
  const [saving,    setSaving]    = useState(false)
  const [name,      setName]      = useState('')
  const [type,      setType]      = useState('expense')
  const [amountStr, setAmountStr] = useState('0')
  const [category,  setCategory]  = useState(null)
  const [account,   setAccount]   = useState(null)
  const [fromAcct,  setFromAcct]  = useState(null)
  const [toAcct,    setToAcct]    = useState(null)
  const [nameError, setNameError] = useState(false)
  const [showCat,   setShowCat]   = useState(false)
  const [showAcct,  setShowAcct]  = useState(false)
  const [showFrom,  setShowFrom]  = useState(false)
  const [showTo,    setShowTo]    = useState(false)

  const creditAvailMap = useCreditAvailMap(allAccounts ?? [])

  const isEdit = !!template?.id
  const expenseCats = (allCategories ?? []).filter(c => c.type === 'expense')
  const inflowCats  = (allCategories ?? []).filter(c => c.type === 'inflow')
  const visibleCats = type === 'inflow' ? inflowCats : expenseCats

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false); setNameError(false)
    if (template?.id) {
      setName(template.name ?? '')
      setType(template.type ?? 'expense')
      setAmountStr(numToMoneyStr(template.amount ?? 0))
      setCategory((allCategories ?? []).find(c => c.name === template.category) ?? null)
      setAccount((allAccounts ?? []).find(a => a.name === template.account) ?? null)
      setFromAcct((allAccounts ?? []).find(a => a.name === template.fromAccount) ?? null)
      setToAcct((allAccounts ?? []).find(a => a.name === template.toAccount) ?? null)
    } else {
      setName(''); setType('expense'); setAmountStr('0')
      setCategory(null); setAccount(null); setFromAcct(null); setToAcct(null)
    }
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id])

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const data = {
        name: name.trim(), type,
        amount: parseMoney(amountStr) || 0,
        /* The template's name IS its note. There were two fields - "Template
           name" and "Default note" - and on every template anyone actually
           made they said the same thing twice: "Grab to work" and "Grab". One
           field, written to both columns, so the picker has a name and the
           confirm sheet opens with the note already filled. */
        description: name.trim(),
        category: category?.name ?? null,
        account: account?.name ?? null,
        fromAccount: fromAcct?.name ?? null,
        toAccount: toAcct?.name ?? null,
      }
      if (isEdit) {
        await db.templates.update(template.id, data)
      } else {
        await db.templates.add({ ...data, createdAt: new Date().toISOString() })
      }
      onClose()
    } catch (e) {
      console.error('[TemplateForm] save failed:', e)
      showToast('Failed to save template', 'error')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!isEdit) return
    setSaving(true)
    try {
      await db.templates.delete(template.id)
      await deleteTemplateRemote(template.id, template.name)
      onClose()
    }
    catch (e) {
      console.error('[TemplateForm] delete failed:', e)
      showToast('Failed to delete template', 'error')
      setSaving(false)
    }
  }

  return (
    <>
      {/* The same z 120 it drew by hand - it opens from the template manager
          at 110 and has to sit above it - and the same 45% scrim. Sheet's
          default `bg-panel` surface is exactly the one this had, so
          no `surface` here.

          92vh goes through `maxHeight` rather than the old max-h utility:
          that prop is what sets --sheet-max, and an inline height would
          outrank `html.web .sheet-panel`, which is the rule that makes this a
          centred modal on desktop. Asking for a height also docks the panel,
          which is where this one already sat.

          The action row moves out of the scrolling body into Sheet's pinned
          footer, so a form long enough to scroll cannot push Save out of
          reach. */}
      <Sheet
        open={open}
        onClose={onClose}
        z={120}
        scrim={45}
        maxHeight="92vh"
        /* The `if (saving) return` the old local close() opened with: a sheet
           that is writing a template must not be dismissed out from under the
           write. */
        dismissible={!saving}
        title={isEdit ? 'Edit Template' : 'New Template'}
        titleAction={(
          <div className="flex items-center gap-3">
            {isEdit && (
              <button onClick={handleDelete} disabled={saving}
                className="text-xs font-semibold text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl
                  bg-red-50 dark:bg-red-500/10 active:bg-red-100 transition-colors">
                Delete
              </button>
            )}
            <button onClick={onClose} disabled={saving}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
              Cancel
            </button>
          </div>
        )}
        footer={(
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={onClose} disabled={saving}
            >
              Cancel
            </Button>
            <Button className="flex-[2]" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add template'}
            </Button>
          </div>
        )}
      >
          {/* The add forms' layout, because this is the same form.

              A template IS a pre-filled expense, inflow or transfer, and this
              screen asked for the same five things the add pages ask for -
              in a different order, with different controls, and with the
              amount as the third of six identical 48px rows. So: the figure
              large and first, the type under it, then the same rail and the
              same account row those pages use. */}
          <div className="pb-2">
            <div className="flex flex-col items-center px-6 pt-6 pb-6">
              <input
                type="text"
                inputMode="decimal"
                placeholder="₱0.00"
                value={amountStr === '0' ? '' : amountStr}
                onChange={moneyChangeHandler(setAmountStr)}
                aria-label="Default amount"
                className="amount-input font-semibold tabular-nums bg-transparent text-center w-full
                  text-slate-900 dark:text-white outline-none
                  placeholder-slate-200 dark:placeholder-slate-800"
              />
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">
                Default amount
              </p>

              {/* The type, directly under the figure - it decides the figure's
                  sign and everything below, so it belongs with it rather than
                  in the list of fields it governs. Locked on edit, as before:
                  changing it would strand the category and accounts. */}
              <div className="flex items-center gap-2 mt-5">
                {['expense', 'inflow', 'transfer'].map(t => {
                  const on = type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      disabled={isEdit}
                      aria-pressed={on}
                      onClick={() => {
                        setType(t)
                        setCategory(null); setAccount(null); setFromAcct(null); setToAcct(null)
                      }}
                      className={[
                        'h-9 px-4 rounded-full text-13 font-semibold border',
                        'transition-colors duration-150',
                        isEdit ? 'opacity-60' : 'active:scale-95',
                        on
                          ? 'seg-active border-primary/40 bg-primary/[0.08] dark:bg-primary/[0.12]'
                          : 'border-slate-200/80 dark:border-primary/[0.14] text-slate-500 dark:text-slate-400 bg-white dark:bg-primary/[0.07]',
                      ].join(' ')}
                      style={on ? { '--seg-color': 'var(--color-primary)' } : undefined}
                    >
                      {TMPL_TYPE_STYLE[t]?.label}
                    </button>
                  )
                })}
              </div>
              {isEdit && (
                <p className="text-11 text-slate-400 dark:text-slate-500 mt-2">
                  Type cannot change after saving
                </p>
              )}
            </div>

            <div className="flex flex-col gap-5">
              {/* Description - which is the template's name. */}
              <div>
                <div className="flex items-baseline gap-2">
                  <SectionLabel>Description</SectionLabel>
                  {nameError && (
                    <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-1.5">
                      Required
                    </p>
                  )}
                </div>
                <div className={fieldFrame(nameError)}>
                  <input
                    value={name}
                    onChange={e => { setName(e.target.value); setNameError(false) }}
                    placeholder="Jeep fare, morning coffee"
                    maxLength={40}
                    className="flex-1 min-w-0 bg-transparent outline-none
                      text-sm font-medium text-slate-800 dark:text-white
                      placeholder-slate-400 dark:placeholder-slate-500 placeholder:font-normal"
                  />
                </div>
              </div>

              {/* Category - the rail, not a row that opens another sheet. */}
              {type !== 'transfer' && (
                <div>
                  <SectionLabel>Category</SectionLabel>
                  <CategoryRail
                    categories={visibleCats}
                    selected={category}
                    onSelect={setCategory}
                    gutter={20}
                  />
                </div>
              )}

              {/* Account, or the two legs - the same control the add forms
                  use, so an account is its card here too. */}
              {type !== 'transfer' ? (
                <div>
                  <SectionLabel>Account</SectionLabel>
                  <AccountSelectRow
                    account={account}
                    creditAvailable={account ? creditAvailMap?.[account.name] : null}
                    onClick={() => setShowAcct(true)}
                  />
                </div>
              ) : (
                /* The transfer page's arrangement: two rows and an arrow,
                   no headings. A heading over each would be 25px of one-sided
                   weight above the connector, so the divider would never sit
                   in the middle of the gap it divides - and the arrow already
                   says which way the money goes, in one glyph instead of two
                   words. The role survives for a screen reader in ariaLabel,
                   which is the only thing the headings were carrying. */
                <>
                  <AccountSelectRow
                    account={fromAcct}
                    emptyText="Select source"
                    ariaLabel="Transfer from"
                    creditAvailable={fromAcct ? creditAvailMap?.[fromAcct.name] : null}
                    onClick={() => setShowFrom(true)}
                  />

                  <div className="flex items-center gap-3 px-1">
                    <Divider className="flex-1" />
                    <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/[0.07]
                      flex items-center justify-center text-slate-400 dark:text-slate-500">
                      <IconArrowDown />
                    </div>
                    <Divider className="flex-1" />
                  </div>

                  <AccountSelectRow
                    account={toAcct}
                    emptyText="Select destination"
                    ariaLabel="Transfer to"
                    creditAvailable={toAcct ? creditAvailMap?.[toAcct.name] : null}
                    onClick={() => setShowTo(true)}
                  />
                </>
              )}
            </div>
          </div>
      </Sheet>

      {/* Nested pickers */}
      <CategoryPickerSheet open={showCat} onClose={() => setShowCat(false)}
        categories={visibleCats} selected={category} onSelect={c => { setCategory(c); setShowCat(false) }} />
      <AccountPickerSheet open={showAcct} onClose={() => setShowAcct(false)}
        accounts={allAccounts ?? []} selected={account} onSelect={a => { setAccount(a); setShowAcct(false) }} />
      <AccountPickerSheet open={showFrom} onClose={() => setShowFrom(false)}
        accounts={allAccounts ?? []} selected={fromAcct} onSelect={a => { setFromAcct(a); setShowFrom(false) }}
        exclude={toAcct ? [toAcct.id] : []} />
      <AccountPickerSheet open={showTo} onClose={() => setShowTo(false)}
        accounts={allAccounts ?? []} selected={toAcct} onSelect={a => { setToAcct(a); setShowTo(false) }}
        exclude={fromAcct ? [fromAcct.id] : []} />
    </>
  )
}

// ── Template manager sheet ─────────────────────────────────────────────────────

/**
 * Quick templates.
 *
 * `variant="page"` is the mobile route at /settings/templates, with the
 * app's back disc; `variant="sheet"` is the desktop modal that
 * src/web/pages/WebSettings.jsx still uses. Same split as Categories and
 * Monthly budgets, and for the same reason: editing a template opens a form
 * sheet, and a sheet on top of a sheet is a stack the phone has no way to
 * explain. On a page the form is the only sheet on screen.
 */
export function TemplateManager({ open, onClose, variant = 'sheet' }) {
  const asPage = variant === 'page'
  const { showToast } = useToast()
  /* No `closing` flag and no scroll lock: the sheet variant is a <Sheet>,
     which owns the overlay, the panel, the grab handle, the scroll lock,
     Escape, the focus trap and the 240ms exit. The page never locked scroll
     anyway. */
  const [formOpen,   setFormOpen]   = useState(false)
  const [editingTpl, setEditingTpl] = useState(null)

  const templates  = useLiveQuery(() => db.templates.toArray(), [], [])
  const accounts   = useLiveQuery(() => db.accounts.toArray(),  [], [])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const catMap = useMemo(() =>
    Object.fromEntries((categories ?? []).map(c => [c.name, c])), [categories])

  function openAdd()       { setEditingTpl(null); setTimeout(() => setFormOpen(true), 0) }
  function openEdit(tpl)   { setEditingTpl(tpl);  setTimeout(() => setFormOpen(true), 0) }
  async function deleteTpl(tpl) {
    try {
      await db.templates.delete(tpl.id)
      await deleteTemplateRemote(tpl.id, tpl.name)
    } catch (e) {
      console.error('[TemplateManager] delete failed:', e)
      showToast('Failed to delete template', 'error')
    }
  }

  /* The list and the add button are shared; only the shell differs. The page
     lets the document scroll, the sheet scrolls inside its panel. */
  const listBody = (
    <>
      {(templates ?? []).length === 0 ? (
        <div className="py-14 text-center px-8">
          <p className="mb-3 flex justify-center text-slate-400 dark:text-slate-500"><IconTemplate size={30} /></p>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No templates yet</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Add one below, or toggle &ldquo;Save as template&rdquo; when confirming any transaction
          </p>
        </div>
      ) : (
        <div className="mx-5 rounded-2xl overflow-hidden bg-white border border-slate-100
          dark:bg-white/[0.04] dark:border-white/[0.07] shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none mb-3">
          {(templates ?? []).map((tpl, i) => (
            <div key={tpl.id}>
              <TemplateRow
                tpl={tpl}
                cat={catMap[tpl.category]}
                onTap={openEdit}
                onLongPressDelete={deleteTpl}
              />
              {i < (templates ?? []).length - 1 && <Divider inset="row" />}
            </div>
          ))}
        </div>
      )}

      <div className="px-5">
        <Button block onClick={openAdd}>
          <IconPlus size={15} strokeWidth="2.5" />
          Add Template
        </Button>
        <p className="text-11 text-slate-400 dark:text-slate-500 text-center mt-2.5">
          Hold a template to quickly delete it
        </p>
      </div>
      <div className="h-8 shrink-0" />
    </>
  )

  const formSheet = (
    <TemplateFormSheet
      open={formOpen}
      onClose={() => setFormOpen(false)}
      template={editingTpl}
      allAccounts={accounts ?? []}
      allCategories={categories ?? []}
    />
  )

  if (asPage) {
    return (
      <>
        <SubPage
          title="Quick Templates"
          action={(
            <IconButton label="New template" variant="primary" onClick={openAdd}>
              <IconPlus />
            </IconButton>
          )}
        >
          <div className="pt-4">{listBody}</div>
        </SubPage>
        {formSheet}
      </>
    )
  }

  return (
    <>
      {/* The same z 110 and the same 45% scrim the hand-rolled overlay drew,
          and the recessed slate surface it had: the list is a white card, and
          on Sheet's default white panel it would be white on white.

          92vh through `maxHeight` rather than the old max-h utility - that
          prop is what sets --sheet-max, and an inline height would outrank
          `html.web .sheet-panel` and strand the desktop modal at the bottom
          of the window. It also docks the panel, which is where this one
          already sat, and the docked bottom pad is Sheet's now rather than
          the max(24px, safe-area) this set by hand. */}
      <Sheet
        open={open}
        onClose={onClose}
        z={110}
        scrim={45}
        maxHeight="92vh"
        surface="bg-page"
        title="Quick Templates"
        titleAction={(
          <button onClick={onClose} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
            Done
          </button>
        )}
      >
        {/* -mx-5 cancels Sheet's gutter, and has to: `listBody` is the page's
            body as well, SubPage draws no gutter of its own, and every block
            inside carries its own mx-5 or px-5. */}
        <div className="-mx-5 pt-4">{listBody}</div>
      </Sheet>
      {formSheet}
    </>
  )
}

/** The desktop modal. Imported by src/web/pages/WebSettings.jsx. */
export function TemplateManagerSheet(props) {
  return <TemplateManager {...props} variant="sheet" />
}

/** The mobile route at /settings/templates. */
export function TemplatesPage() {
  const navigate = useNavigate()
  return <TemplateManager open onClose={() => navigate(-1)} variant="page" />
}
