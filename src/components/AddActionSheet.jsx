import { useNavigate } from 'react-router-dom'
import Card from './ui/Card'
import Sheet from './ui/Sheet'

function IconArrowUp() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="15" x2="10" y2="5" />
      <polyline points="5,9 10,4 15,9" />
    </svg>
  )
}

function IconArrowDown() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="5" x2="10" y2="15" />
      <polyline points="5,11 10,16 15,11" />
    </svg>
  )
}

function IconTransfer() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="7" x2="15" y2="7" />
      <polyline points="12,4 16,7 12,10" />
      <line x1="17" y1="13" x2="5" y2="13" />
      <polyline points="8,10 4,13 8,16" />
    </svg>
  )
}

/* No descriptions. "Record money spent" under "Expense" tells someone who
   opened a finance app to log an expense nothing they did not know, and three
   of them made a three-item sheet twice as tall as it needed to be. The
   coloured arrow says the direction; the word says the rest. */
const ACTIONS = [
  {
    label: 'Expense',
    path: '/expense',
    Icon: IconArrowUp,
    iconBg: 'bg-red-500/[0.10] border border-red-500/[0.20] text-red-500 dark:text-red-400 shadow-sm dark:shadow-[inset_0_1px_0_rgba(239,68,68,0.12)]',
  },
  {
    label: 'Inflow',
    path: '/inflow',
    Icon: IconArrowDown,
    iconBg: 'bg-emerald-500/[0.10] border border-emerald-500/[0.20] text-emerald-600 dark:text-emerald-400 shadow-sm dark:shadow-[inset_0_1px_0_rgba(16,185,129,0.12)]',
  },
  {
    label: 'Transfer',
    path: '/transfer',
    Icon: IconTransfer,
    iconBg: 'bg-primary/[0.10] border border-primary/[0.20] text-primary shadow-sm dark:shadow-[inset_0_1px_0_rgba(var(--color-primary-rgb),0.12)]',
  },
]

export default function AddActionSheet({ open, onClose }) {
  const navigate = useNavigate()

  /* Close, then navigate - the 260ms clears Sheet's 240ms exit animation.
     Routing while the panel is still on screen takes the sheet down with the
     page under it, which reads as a cut rather than a transition.

     Everything else this component used to carry - the overlay, the panel,
     the handle, the scroll lock, Escape (including the ref dance that kept
     the listener pointing at a fresh callback) and the exit timer - is
     Sheet's now. */
  const handleAction = (path) => {
    onClose()
    setTimeout(() => navigate(path), 260)
  }

  return (
    <Sheet open={open} onClose={onClose} ariaLabel="Add a transaction">
      <div className="pt-1 pb-2">
        <div className="flex flex-col gap-3.5">
          {ACTIONS.map(({ label, path, Icon, iconBg }) => (
            <Card
              key={path}
              as="button"
              interactive
              padding="md"
              onClick={() => handleAction(path)}
              className="flex items-center gap-4"
            >
              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
                <Icon />
              </div>
              <p className="flex-1 min-w-0 font-semibold text-[15px] text-slate-900 dark:text-white">
                {label}
              </p>
              <svg className="text-slate-300 dark:text-slate-600 shrink-0" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="5,2 9,7 5,12" />
              </svg>
            </Card>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
