/**
 * Monthly limits: the manager, and the page it lives on.
 *
 * Lifted out of Settings.jsx unchanged.
 */
import { useState, useMemo } from 'react'
import db from '../../db/db'
import { useBack } from '../../hooks/useBack'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../../utils/moneyInput'
import SubPage from '../../components/SubPage'
import CategoryGlyph from '../../components/CategoryGlyph'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'

// ── Budget summary card (inside category manager) ──────────────────────────────

/* BudgetSummaryCard lived here: a headline total with a progress bar,
   shown at the top of both budget screens. The Budget page opens with
   the same figure inside its gauge, and the limit editor now hangs off
   that page - so it was the same number three times. Deleted with its
   last caller rather than left for someone to find and reuse. */


// ── Budget manager sheet ───────────────────────────────────────────────────────

/**
 * Monthly budgets: one implementation, two presentations.
 *
 * `variant="page"` is the mobile route at /settings/budgets, with the app's
 * standard sub-page header. `variant="sheet"` is the modal the DESKTOP
 * settings uses - src/web/pages/WebSettings.jsx imports BudgetManagerSheet and
 * presents it over a two-pane layout, where a full-page route would be wrong.
 *
 * A variant rather than two components, because everything that matters here
 * is the state and the save semantics - pending edits held locally until you
 * commit them - and duplicating that to get two shells would be duplicating
 * the only part with any behaviour in it.
 */
export function BudgetManager({ open, onClose, variant = 'sheet' }) {
  const asPage = variant === 'page'
  const { showToast } = useToast()
  const [localBudgets, setLocalBudgets] = useState({})
  const [saving,       setSaving]       = useState(false)
  /* No `closing` flag and no scroll lock any more: the sheet variant is a
     <Sheet>, and it owns the overlay, the panel, the grab handle, the scroll
     lock, Escape, the focus trap and the 240ms exit. `open` decides all of
     it. The page variant never locked scroll in the first place. */

  /* No transactions query any more. This screen read EVERY transaction in the
     database to colour a progress bar and print a "spent" figure under each
     row - both of which the Budget page shows already, and this screen now
     hangs off that page. Setting a limit is the one job here. */
  const categories = useLiveQuery(() => db.categories.toArray(), [], [])

  const expenseCats = useMemo(() =>
    (categories ?? [])
      .filter(c => c.type === 'expense')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name)),
    [categories],
  )

  const hasPendingChanges = useMemo(() =>
    Object.entries(localBudgets).some(([id, str]) => {
      const cat = (categories ?? []).find(c => String(c.id) === String(id))
      return cat && parseMoney(str) !== (cat.budget ?? 0)
    }),
    [localBudgets, categories],
  )

  /* Dropping the pending edits in the same breath as closing is safe on the
     sheet too: Sheet holds on to what it was showing for the length of the
     exit, so the fields do not empty themselves on the way out. */
  const close = () => {
    setLocalBudgets({})
    onClose()
  }

  function handleLocalChange(catId, str) {
    setLocalBudgets(prev => ({ ...prev, [catId]: str }))
  }

  async function saveAll() {
    setSaving(true)
    try {
      await Promise.all(
        Object.entries(localBudgets).map(([id, str]) => {
          const cat = (categories ?? []).find(c => String(c.id) === String(id))
          if (!cat) return Promise.resolve()
          // An empty field is no limit: parseMoney('') is 0, and 0 is how
          // "no limit" has always been stored.
          const newBudget = parseMoney(str) || 0
          if (newBudget === (cat.budget ?? 0)) return Promise.resolve()
          return db.categories.update(Number(id), { budget: newBudget })
        })
      )
      setLocalBudgets({})
      close()
    } catch (e) {
      console.error('[BudgetManager] save failed:', e)
      showToast('Failed to save budgets', 'error')
    } finally {
      setSaving(false)
    }
  }


  /* Only the page may bail out on !open. The sheet has to keep rendering
     while it slides away, and Sheet stops itself once the exit is over -
     returning null here would unmount it mid-slide. */
  if (asPage && !open) return null

  /* The list and the save button are shared; only the shell around them
     differs. The page lets the document scroll and puts the button after the
     list; the sheet scrolls internally and pins the button to the panel. */
  /* One inset card of rows, not a stack of cards that change shape when you
     tap them. Each row is a label and a field, which is what setting a number
     is; the glyph keeps the category recognisable at a glance.

     No summary card at the top either: this screen hangs off the Budget page,
     which opens with the same figure in its gauge. */
  const listBody = (
    <>
            <div className="mx-4 mb-6 rounded-2xl overflow-hidden
              bg-white border border-slate-100
              dark:bg-white/[0.04] dark:border-white/[0.07]">
              {expenseCats.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No expense categories yet</p>
                </div>
              ) : expenseCats.map((cat, i) => {
                /* The field's text: whatever has been typed, else the saved
                   limit, and an empty string for zero - a category with no
                   limit shows the placeholder rather than "0", because 0 is
                   not a limit anyone set. */
                const localStr = localBudgets[cat.id]
                const saved    = cat.budget ?? 0
                const text     = localStr !== undefined
                  ? (localStr === '0' ? '' : localStr)
                  : (saved > 0 ? numToMoneyStr(saved) : '')
                const isDirty  = localStr !== undefined && (parseMoney(localStr) || 0) !== saved

                return (
                  /* A <label>, so the whole row is the field's target: tapping
                     anywhere on it - the glyph, the name, the empty space -
                     puts the caret in the amount, which is how a row like this
                     behaves on this platform. */
                  <label
                    key={cat.id}
                    className={[
                      'flex items-center gap-3 px-4 h-[58px] cursor-text',
                      i > 0 ? 'border-t border-slate-100 dark:border-white/[0.06]' : '',
                      isDirty ? 'bg-primary/[0.04] dark:bg-primary/[0.07]' : '',
                    ].join(' ')}
                  >
                    <span
                      className="cat-tile w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ '--cat-color': cat.color ?? '#64748b' }}
                    >
                      <CategoryGlyph cat={cat} size={19} />
                    </span>

                    <span className="flex-1 min-w-0 text-sm font-semibold text-slate-800 dark:text-white truncate">
                      {cat.name}
                    </span>

                    {/* Sign and number are one unit with a hair of space, not
                        two items in the row's 12px rhythm. The sign appears
                        only once there is a number for it to belong to; in
                        front of the placeholder it reads as a value of
                        nothing. */}
                    <span className="flex items-baseline gap-1 shrink-0">
                      {text !== '' && (
                        <span className="text-sm font-medium text-slate-400 dark:text-slate-500">₱</span>
                      )}
                    {/* Sized in `ch` from its own contents, so the field is
                        exactly as wide as the number and the peso sign sits
                        against it. A fixed width right-aligns the digits but
                        strands the sign at the far end of the box. `ch` is
                        exact here because the figures are tabular. */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={text}
                      onChange={moneyChangeHandler(str => handleLocalChange(cat.id, str))}
                      placeholder="No limit"
                      aria-label={`${cat.name} monthly limit`}
                      style={{ width: text ? `${text.length + 0.5}ch` : '7.5ch' }}
                      className="shrink-0 bg-transparent text-right outline-none
                        text-sm font-semibold tabular-nums
                        text-slate-800 dark:text-white
                        placeholder:font-normal placeholder:text-slate-400 dark:placeholder:text-slate-600"
                      />
                    </span>
                  </label>
                )
              })}
            </div>
    </>
  )

  const saveButton = (
            <Button block onClick={saveAll} disabled={!hasPendingChanges || saving}>
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
                : 'Save changes'}
            </Button>
  )

  /* No line under the title. "Tap a category to set its monthly limit"
     described the old flow - tap a card, it becomes an editor - and the rows
     are fields now: you tap one and type. */
  if (asPage) {
    return (
      <SubPage title="Monthly Limits" onBack={close}>
        <div className="pt-4">{listBody}</div>
        <div className="px-5 -mt-3">{saveButton}</div>
      </SubPage>
    )
  }

  return (
    /* The same z and the same 45% scrim the hand-rolled overlay drew, and the
       recessed slate surface it had: these rows are white cards, and on
       Sheet's default white panel they would be white on white.

       88vh goes through `maxHeight`, never a style object. An inline height
       outranks `html.web .sheet-panel`, which is the rule that makes this a
       centred modal on desktop - setting it by hand pins the desktop dialog
       to the bottom of the window. Asking for a height also docks the panel,
       which is what it did before: it was flush with the bottom edge. */
    <Sheet
      open={open}
      onClose={close}
      z={100}
      scrim={45}
      maxHeight="88vh"
      surface="bg-page"
      title="Monthly Budgets"
      titleAction={(
        <button onClick={close} className="text-xs font-medium text-slate-500 dark:text-slate-400 active:opacity-60">
          {hasPendingChanges ? 'Discard' : 'Done'}
        </button>
      )}
      footer={saveButton}
    >
      {/* -mx-5 cancels Sheet's gutter, and has to: `listBody` is the page's
          body as well, and its card carries its own mx-4.

          The line under the heading moves into the body rather than staying
          beside it - Sheet's title slot holds text only, so a second
          paragraph there would leak into the dialog's accessible name. */}
      <div className="-mx-5">
        <p className="px-5 text-xs text-slate-400 dark:text-slate-500">
          Tap a category to set its monthly limit
        </p>
        <div className="pt-4">{listBody}</div>
      </div>
    </Sheet>
  )
}

/** The desktop modal. Imported by src/web/pages/WebSettings.jsx. */
export function BudgetManagerSheet(props) {
  return <BudgetManager {...props} variant="sheet" />
}

/**
 * The mobile route at /settings/budgets - the limit editor.
 *
 * Reached from "Edit limits" on the Budget page, so back normally means back
 * to that page. The fallback is /budget rather than / for the case where this
 * URL was opened directly: this screen is part of the Budget page, and landing
 * on it from a deep link should leave you inside that, not on the dashboard.
 */
export function BudgetsPage() {
  const back = useBack('/budget')
  return <BudgetManager open onClose={back} variant="page" />
}
