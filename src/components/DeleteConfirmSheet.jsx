import Sheet from './ui/Sheet'
import Button from './ui/Button'
import AmountHero from './ui/AmountHero'
import SwipeConfirm from './SwipeConfirm'

/** The red used for a deletion, matching the transaction sheet's. */
const DANGER = '#ef4444'

/**
 * Asking before destroying something, in one shape.
 *
 * ── Why a sheet and not a second tap ──
 *
 * A confirmation that lives on the button it is confirming is answered by the
 * same gesture that got it wrong: tap, tap. It also has to borrow whatever
 * space the button had, so it can never say what is about to be lost - which
 * is the only thing a confirmation is for.
 *
 * The transaction sheet already did this properly - a red disc, a question, the
 * figure, and a flat list of what the thing IS - and everything else in the app
 * was asking twice on a button instead. This is that sheet, made reusable, so a
 * bill, a debt and an entry are all confirmed the same way.
 *
 * ── And the last step is a drag ──
 *
 * Posting a bill, which is undoable, already asks for a deliberate drag.
 * Deleting asked for less than that, which had it backwards. Cancel stays an
 * ordinary tap: backing out should always be the easy one.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} props.onConfirm
 * @param {string} props.title      the question, e.g. "Delete this bill?"
 * @param {string} [props.body]     what happens, in one line
 * @param {number} [props.amount]   the figure at stake, when there is one
 * @param {string} [props.label]    the pill's wording
 * @param {boolean} [props.busy]
 * @param {React.ReactNode} [props.children]  DetailRows naming what this is
 */
export default function DeleteConfirmSheet({
  open, onClose, onConfirm,
  title, body, amount = null,
  label = 'Swipe to delete',
  busy = false,
  children,
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={140}
      scrim={55}
      dismissible={!busy}
      ariaLabel={title}
      footer={(
        <div>
          <SwipeConfirm
            tone="danger"
            label={label}
            confirmingLabel="Deleting…"
            busy={busy}
            onConfirm={onConfirm}
          />
          {!busy && (
            <Button block variant="quiet" size="sm" className="mt-2" onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      )}
    >
      <div>
        {/* A red disc rather than an icon of the thing being deleted: what
            matters here is not what it is but what is about to happen to it.
            The same disc the sign-out and reset confirmations use. */}
        <div className="flex justify-center">
          <span className="w-14 h-14 rounded-2xl flex items-center justify-center
            bg-red-100 dark:bg-red-500/15 text-red-500 dark:text-red-400"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </span>
        </div>

        <div className="text-center mt-4">
          <h3 className="text-17 font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          {body && (
            <p className="mt-1 mx-auto max-w-[268px] text-13 leading-snug text-balance
              text-slate-400 dark:text-slate-500">
              {body}
            </p>
          )}
        </div>

        {amount != null && (
          <AmountHero color={DANGER} className="mt-5 mb-6">
            {amount}
          </AmountHero>
        )}

        {/* Whatever names the thing: a note, an account, a person. Flat rows,
            the same list the detail sheets use. */}
        {children && <div className="flex flex-col">{children}</div>}
      </div>
    </Sheet>
  )
}
