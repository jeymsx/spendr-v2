import { useState, useEffect } from 'react'
import Sheet from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import SwipeConfirm from '../../components/SwipeConfirm'
import { useToast } from '../../context/ToastContext'
import { surveyDuplicates, applyDedupe } from '../../lib/dedupeWrite'
import { fmt } from '../../lib/money'

const LABEL = { debts: 'Debts', recurring: 'Bills', templates: 'Templates' }

/**
 * Merging rows that are the same row.
 *
 * ── Why it shows the list ──
 *
 * This deletes financial records, and "trust me, they were duplicates" is not
 * something an app gets to say about somebody's money. So it counts first,
 * names every group, and does nothing until the drag. The count and the
 * deletion come from one planner - see lib/dedupe.js - so what is promised
 * here and what happens cannot drift.
 *
 * The rule is strict on purpose: rows have to match on every meaningful
 * field, including the date they were created and how much has been paid. A
 * duplicate that misses the rule stays on screen and can be deleted by hand;
 * a real debt merged by a loose rule is gone silently. Those are not
 * comparable risks.
 */
export function DedupeSheet({ open, onClose }) {
  const { showToast } = useToast()
  const [plan, setPlan] = useState(/** @type {any} */ (null))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlan(null)
    setBusy(false)
    surveyDuplicates().then(p => { if (alive) setPlan(p) })
    return () => { alive = false }
  }, [open])

  async function run() {
    setBusy(true)
    try {
      const done = await applyDedupe()
      showToast(done.removed
        ? `${done.removed} duplicate${done.removed === 1 ? '' : 's'} merged`
        : 'Nothing to merge')
      onClose()
    } catch (e) {
      console.error('[Dedupe] failed:', e)
      showToast('Could not merge those', 'error')
      setBusy(false)
    }
  }

  const total = plan?.total ?? 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={130}
      scrim={55}
      dismissible={!busy}
      title="Merge duplicates"
      maxHeight="88dvh"
      footer={total > 0 ? (
        <div>
          <SwipeConfirm
            label={`Swipe to merge ${total}`}
            confirmingLabel="Merging…"
            busy={busy}
            onConfirm={run}
          />
          {!busy && (
            <Button block variant="quiet" size="sm" className="mt-2" onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      ) : (
        <Button block variant="secondary" onClick={onClose}>Close</Button>
      )}
    >
      <div className="pb-1">
        {!plan ? (
          <p className="py-6 text-center text-13 text-slate-400 dark:text-slate-500">
            Checking…
          </p>
        ) : total === 0 ? (
          <p className="py-6 text-center text-13 text-slate-500 dark:text-slate-400">
            Nothing is stored twice. There is nothing to merge.
          </p>
        ) : (
          <>
            <p className="mb-4 text-13 leading-snug text-slate-500 dark:text-slate-400">
              These rows are stored more than once, and every copy is identical.
              Merging keeps one of each and removes the rest, here and on the
              server. Nothing else is touched.
            </p>

            {Object.keys(LABEL).map(name => {
              const t = plan[name]
              if (!t?.removes) return null
              return (
                <div key={name} className="mb-4">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-13 font-semibold text-slate-800 dark:text-white">
                      {LABEL[name]}
                    </span>
                    <span className="text-12 tabular-nums text-slate-400 dark:text-slate-500">
                      {t.rows} rows &rarr; {t.real}
                    </span>
                  </div>
                  <Card padding="none" className="overflow-hidden">
                    {t.groups.map((g, i) => (
                      <div key={g.key}>
                        {i > 0 && <Divider />}
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <span className="flex-1 min-w-0">
                            <span className="block text-13 font-medium text-slate-700 dark:text-slate-200 truncate">
                              {describe(name, g.keep)}
                            </span>
                            <span className="block text-11 text-slate-400 dark:text-slate-500">
                              stored {g.drop.length + 1} times
                            </span>
                          </span>
                          <span className="shrink-0 text-12 font-semibold tabular-nums
                            text-red-500 dark:text-red-400"
                          >
                            &minus;{g.drop.length}
                          </span>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              )
            })}

            {/* The one thing that is NOT reversible by re-syncing. */}
            <p className="text-11 leading-snug text-slate-400 dark:text-slate-500">
              Take a backup first if you would rather be careful. This cannot be
              undone from inside the app.
            </p>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** One line naming the thing, per table. */
function describe(table, row) {
  if (table === 'debts') {
    const who = row.contact || row.name || 'Someone'
    return `${who} · ${fmt(row.amount ?? 0)}${row.notes ? ` · ${row.notes}` : ''}`
  }
  return `${row.name ?? 'Untitled'} · ${fmt(row.amount ?? 0)}`
}
