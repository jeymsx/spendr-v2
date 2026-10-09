import Button from './ui/Button'

/**
 * This browser will not let Spendr keep anything (db/db.js storageProblem):
 * said plainly, with what usually causes it, instead of the spinner every
 * screen used to show for good while waiting on a database that never opened.
 *
 * Drawn like the crash screen (ErrorBoundary), and needing nothing that reads
 * the database, since there is none.
 */
export default function StorageBlocked() {
  return (
    <div className="bg-page flex flex-col items-center justify-center px-8 text-center" style={{ minHeight: '100dvh' }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4
        bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          className="text-amber-500 dark:text-amber-400"
        >
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
          <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-slate-800 dark:text-white">Spendr can’t save here</h1>
      <p className="text-13 text-slate-500 dark:text-slate-400 mt-1.5 max-w-[300px] leading-relaxed">
        This browser isn’t letting Spendr keep data on this device. A private window does this, and so does a setting that stops sites saving data.
      </p>
      <p className="text-13 text-slate-500 dark:text-slate-400 mt-2 max-w-[300px] leading-relaxed">
        Open Spendr in a normal window, or allow this site to save data, then try again.
      </p>
      <Button className="mt-5 px-6" onClick={() => window.location.reload()}>Try again</Button>
    </div>
  )
}
