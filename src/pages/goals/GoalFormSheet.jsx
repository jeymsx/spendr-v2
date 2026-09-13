import { useState, useMemo, useEffect, useId } from 'react'
import db from '../../db/db'
import { useToast } from '../../context/ToastContext'
import { parseMoney, numToMoneyStr, moneyChangeHandler } from '../../utils/moneyInput'
import { isFundable, GOAL_ICONS, nextRank } from '../../lib/goals'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import SectionLabel from '../../components/ui/SectionLabel'
import Field, { fieldFrame } from '../../components/ui/Field'
import MoneyField from '../../components/ui/MoneyField'
import { AccountPickRail, fmtDateFull } from './shared'

/**
 * Create or edit a goal.
 *
 * ── It wears the app's fields now ──
 *
 * Every input here used to be hand-rolled: a 15px text box at radius 16 with
 * its own border and focus colour, declared four times in this file. The app
 * settled that argument in ui/Field - 52px, capsule, filled, label above - and
 * this form was simply written before it, so a goal was the one thing you
 * could edit on a screen that looked like a different app's.
 *
 * The date row is the arrangement the bills form uses: the frame, the value
 * drawn as text, and the real <input type="date"> invisible on top of it.
 * A raw date control cannot be made to match, because it carries an intrinsic
 * width and its own indicator button, and neither obeys the frame around it.
 */
export default function GoalFormSheet({
  open, goal, accounts, allGoals, onClose,
  /** The detail page has to leave when its subject is deleted. */
  onDeleted,
}) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [target, setTarget] = useState('0')
  const [picked, setPicked] = useState([])
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  const uid = useId()
  const isEdit = !!goal

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(false)
    if (goal) {
      setName(goal.name ?? '')
      setIcon(goal.icon ?? '🎯')
      setTarget(numToMoneyStr(goal.target ?? 0))
      setPicked(goal.accounts ?? [])
      setTargetDate(goal.targetDate ?? '')
    } else {
      setName('')
      setIcon('🎯')
      setTarget('0')
      setPicked([])
      setTargetDate('')
    }
  }, [open, goal])

  const fundable = useMemo(() => (accounts ?? []).filter(isFundable), [accounts])

  const targetNum = parseMoney(target)
  const canSave = name.trim().length > 0 && targetNum > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const row = {
        name: name.trim(),
        icon,
        target: targetNum,
        // Only names that still exist get stored, so a stale pick from a
        // deleted account cannot linger in the array.
        accounts: picked.filter(n => fundable.some(a => a.name === n)),
        targetDate: targetDate || null,
        updatedAt: now,
        synced: 0,
      }
      if (isEdit) {
        await db.goals.update(goal.id, row)
      } else {
        await db.goals.add({
          ...row,
          priority: nextRank(allGoals ?? []),
          createdAt: now,
          archivedAt: null,
        })
      }
      showToast(isEdit ? 'Goal updated' : 'Goal created')
      onClose()
    } catch (e) {
      console.error('[Goals] save failed:', e)
      showToast('Failed to save goal', 'error')
      setSaving(false)
    }
  }

  /* The actions are Sheet's `footer`, which pins them under the scrolling
     body. They used to be the last thing inside a panel that scrolled as one
     piece: on a short screen "Create goal" sat below the fold of a form long
     enough to need scrolling in the first place.

     One button, because this sheet does one thing. Archive and Delete moved
     to the goal's own page: editing is changing what a goal SAYS, and those
     two change whether it exists at all - so reaching them meant opening a
     form you did not want, and the form's own Save sat above two actions
     that ignored everything you had typed. */
  const actions = (
    <Button block onClick={handleSave} disabled={!canSave}>
      {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create goal'}
    </Button>
  )

  return (
    /* 88vh as it was, in dvh - the form is long enough that the difference is
       a whole field on a phone with the URL bar showing. A height also docks
       the panel, which is what a sheet that means to scroll wants. */
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Goal' : 'New Goal'}
      maxHeight="88dvh"
      footer={actions}
    >
      <div className="py-4">

        <>
            {/* Name */}
            <Field
              id={`${uid}-name`}
              label="What are you saving for"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Emergency fund"
              maxLength={40}
            />

            {/* Icon */}
            <div className="mt-4">
              {/* A grid of buttons is not one control, so this stays a <p>. */}
              <SectionLabel>Icon</SectionLabel>
              <div className="grid grid-cols-8 gap-1.5">
                {GOAL_ICONS.map(g => (
                  <button
                    key={g}
                    onClick={() => setIcon(g)}
                    className={`aspect-square rounded-xl flex items-center justify-center text-18
                      border active:scale-90 transition-transform duration-75 ${
                        icon === g
                          ? 'bg-primary/[0.12] border-primary'
                          : 'bg-white dark:bg-primary/[0.07] border-slate-200/80 dark:border-primary/[0.14]'
                      }`}
                    aria-label={g}
                    aria-pressed={icon === g}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Target */}
            <div className="mt-4">
              <SectionLabel htmlFor={`${uid}-target`}>Target amount</SectionLabel>
              <MoneyField
                id={`${uid}-target`}
                value={target}
                onChange={moneyChangeHandler(setTarget)}
              />
            </div>

            {/* Funding accounts */}
            <div className="mt-4">
              {/* Two sentences used to sit here: that progress is read from
                  these balances, and that credit cards are not listed. The
                  rail says the first one better than the prose did - it is a
                  row of your accounts with their balances printed on them -
                  and the second moved to the (i) on the goals page, next to
                  the rest of how funding works. */}
              <SectionLabel>Funded by</SectionLabel>
              {fundable.length === 0 ? (
                <p className="text-13 text-amber-600 dark:text-amber-400 mt-2">
                  You have no cash, e-wallet, bank or savings account yet.
                </p>
              ) : (
                <AccountPickRail
                  accounts={fundable}
                  picked={picked}
                  /* Null while closed, the record's id while open - so the
                     rail scrolls to this goal's accounts each time the sheet
                     is opened, and never mid-edit. */
                  revealOn={open ? (goal?.id ?? 'new') : null}
                  onToggle={n => setPicked(p =>
                    p.includes(n) ? p.filter(x => x !== n) : [...p, n])}
                />
              )}
            </div>

            {/* Target date */}
            <div className="mt-4">
              <SectionLabel htmlFor={`${uid}-date`}>
                Target date <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
              </SectionLabel>
              <div className={`relative ${fieldFrame()}`}>
                <span className={`flex-1 text-sm font-medium tabular-nums truncate ${
                  targetDate ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                }`}>
                  {fmtDateFull(targetDate) ?? 'Pick a date'}
                </span>
                {targetDate && (
                  /* The only way back to "no date". A native date input has no
                     clear affordance on iOS, and this field is optional. */
                  <button
                    onClick={() => setTargetDate('')}
                    className="relative z-10 shrink-0 text-12 font-semibold text-slate-400
                      dark:text-slate-500 active:opacity-60 px-1"
                  >
                    Clear
                  </button>
                )}
                <input
                  id={`${uid}-date`}
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  onClick={e => { try { e.currentTarget.showPicker?.() } catch { /* older engine */ } }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer
                    [color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              {/* Kept: it is what the date actually does, which the field
                  cannot show. */}
              <p className="text-12 text-slate-500 dark:text-slate-400 mt-1.5 px-1">
                Adds a monthly figure to hit it on time.
              </p>
            </div>
        </>
      </div>
    </Sheet>
  )
}
