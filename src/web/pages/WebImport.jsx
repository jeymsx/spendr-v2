import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'

const ImportWizard = lazy(() => import('../../pages/ImportWizard'))

/**
 * Desktop presentation of the CSV importer.
 *
 * The wizard itself is the mobile component, reused whole — it owns the CSV
 * parsing, the format detection, duplicate skipping and the opening-balance
 * step, and none of that is worth a second implementation. What a phone can't
 * give it is somewhere to put the reference material: on mobile you have to
 * remember which columns a file needs, or back out of the wizard to check.
 * Here it sits in a column beside the wizard, readable while you work.
 *
 * The facts in that column are read off the wizard's own constants
 * (SPENDR_REQUIRED_COLS, TABLE_REQUIRED_COLS, VALID_TYPES) and its dedupe step,
 * so they describe what the parser actually does rather than what it ought to.
 */

/* Spendr's own layout - what Transactions as CSV writes - which is the one to
   lead with. The cloud table's naming (tx_id, transaction_date, from_account,
   to_account) is read too, and said in one line below. */
const COLS = [
  ['txId',        'Stable id. Rows whose id already exists are skipped.'],
  ['type',        'expense, inflow or transfer.'],
  ['date',        'ISO date, e.g. 2026-08-28.'],
  ['description', 'Free text. May be blank.'],
  ['category',    'Created if it does not exist yet.'],
  ['payment',     'Kept as it is. May be blank.'],
  ['account',     'The account for an expense or an inflow.'],
  ['fromAccount', 'The source of a transfer.'],
  ['toAccount',   'The destination of a transfer.'],
  ['amount',      'Positive number. The type carries the direction; a refund is a negative expense.'],
]

/* Optional, and what keeps a round trip whole. */
const OPTIONAL_COLS = [
  'refundOf', 'splitId', 'installmentId', 'toAmount', 'toCurrency',
  'currency', 'baseAmount', 'baseCurrency', 'adjust',
]

function RefPanel({ title, children }) {
  return (
    <section className="card rounded-2xl">
      <header className="px-5 pt-4 pb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      </header>
      <div className="px-5 pb-5">{children}</div>
    </section>
  )
}

const Mono = ({ children }) => (
  <code className="px-1.5 py-0.5 rounded-md text-11 font-mono
    bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-200">
    {children}
  </code>
)

export default function WebImport() {
  return (
    <>
      {/* The phone's page heading, as every desktop page has it now. */}
      <header className="d-page-head">
        <div>
          <h1 className="d-title">Import</h1>
          <p className="d-subtitle">Bring transactions in from a CSV file. Nothing is written until the last step.</p>
        </div>
      </header>

      <div className="flex flex-col xl:flex-row gap-6 xl:items-start min-w-0">
        {/* The wizard. Capped rather than full-width: it is a single column of
            fields and a wide one is harder to read, not easier. */}
        <div className="w-full xl:flex-1 min-w-0 xl:max-w-[720px]">
          <div className="web-embed card-solid rounded-2xl">
            <Suspense fallback={
              <div className="flex items-center justify-center py-24">
                <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            }>
              <ImportWizard />
            </Suspense>
          </div>
        </div>

        {/* Reference — the thing a phone has no room for. */}
        <aside className="w-full xl:w-[340px] shrink-0 flex flex-col gap-6 xl:sticky xl:top-8">
          <RefPanel title="What you can import">
            <ul className="flex flex-col gap-3 text-xs leading-relaxed
              text-slate-600 dark:text-slate-300">
              <li>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  A Spendr export.
                </span>{' '}
                Transactions as CSV, under Reports &amp; exports in Settings, makes a
                file this reads back without any editing. Refunds, splits,
                installment plans and transfers between currencies stay as
                they were.
              </li>
              <li>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  A spreadsheet you built.
                </span>{' '}
                Any CSV with the columns below, in any order.
              </li>
              <li>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  Not the Export CSV on Transactions.
                </span>{' '}
                That file is made for spreadsheets and cannot be read back. To
                move your data, use Transactions as CSV or a backup.
              </li>
            </ul>
          </RefPanel>

          <RefPanel title="Required columns">
            <dl className="flex flex-col gap-2.5">
              {COLS.map(([col, note]) => (
                <div key={col}>
                  <dt className="mb-0.5"><Mono>{col}</Mono></dt>
                  <dd className="text-11 leading-relaxed text-slate-500 dark:text-slate-400">
                    {note}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 pt-4 border-t border-slate-100 dark:border-white/[0.06]
              text-11 leading-relaxed text-slate-500 dark:text-slate-400">
              Optional, and read when they are there:{' '}
              {OPTIONAL_COLS.map((c, i) => (
                <span key={c}>
                  {i > 0 && ', '}
                  <span className="font-mono text-slate-600 dark:text-slate-300">{c}</span>
                </span>
              ))}
              . A file named the way the cloud table is, with{' '}
              <span className="font-mono text-slate-600 dark:text-slate-300">tx_id</span>,{' '}
              <span className="font-mono text-slate-600 dark:text-slate-300">transaction_date</span>,{' '}
              <span className="font-mono text-slate-600 dark:text-slate-300">from_account</span> and{' '}
              <span className="font-mono text-slate-600 dark:text-slate-300">to_account</span>,
              is detected and read too.
            </p>
          </RefPanel>

          <RefPanel title="What happens on import">
            <ul className="flex flex-col gap-2.5 text-11 leading-relaxed
              text-slate-500 dark:text-slate-400">
              <li>
                Accounts and categories named in the file but missing from Spendr
                are created for you.
              </li>
              <li>
                A row whose <Mono>txId</Mono> is already in your data is skipped,
                so re-importing the same file changes nothing.
              </li>
              <li>
                Step 3 asks what each account the import creates held before the
                file's first row. Accounts you already have keep their balances,
                and only the imported transactions are added to them.
              </li>
              <li>
                Rows with an unrecognised type or an unparseable date are flagged
                in the preview before anything is written.
              </li>
            </ul>
          </RefPanel>

          <RefPanel title="Before a large import">
            <p className="text-11 leading-relaxed text-slate-500 dark:text-slate-400">
              Take a backup first. Import has no undo, and a JSON backup restores
              the whole database if a file turns out to be wrong.
            </p>
            <Link
              to="/settings/backup"
              className="mt-3 inline-flex items-center h-8 px-3 rounded-xl text-11 font-semibold
                text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/[0.07]
                hover:bg-slate-200 dark:hover:bg-white/[0.12] transition-colors duration-150"
            >
              Open Backup &amp; restore
            </Link>
          </RefPanel>
        </aside>
      </div>
    </>
  )
}
