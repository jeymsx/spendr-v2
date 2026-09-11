import { cx } from './cx'

/**
 * Nothing here, in the app's own voice.
 *
 * ── What it settles ──
 *
 * Four of these were written as components (Debts, Bills, Transactions, the
 * dashboard's pill) and four more inline (Goals, Budget, Accounts, the
 * account detail). Debts' and Bills' were byte-for-byte the same shape;
 * Transactions' was a 20px squircle holding a 36px icon over 14px and 12px
 * text, which is a different design for the same moment.
 *
 * The Debts/Bills shape wins because two screens had already converged on
 * it: a 56px disc, a 15px semibold line saying what is empty, a 13px line
 * saying what to do about it, and - only sometimes - the way out.
 *
 * ── One line each ──
 *
 * `body` is one sentence. Debts' used to carry two apiece explaining how
 * debts work, which is not what an empty state is for; it is for saying the
 * list is empty and offering the way out of that. If the copy needs a second
 * sentence, the screen needs onboarding, not a longer empty state.
 *
 * ── tone ──
 *
 * An empty list is usually neutral - there is nothing here yet. Sometimes it
 * is GOOD news: no bills overdue, nothing owing. Those read wrong in
 * mournful grey, so `tone="good"` turns the disc emerald. That is the only
 * reason a second tone exists.
 */

const TONE = {
  calm: 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500',
  good: 'bg-emerald-50 dark:bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400',
}

export default function EmptyState({
  /** A glyph, shown in the disc. Omit it for an empty state inside a card,
   *  where a 56px disc is louder than the section it sits in. */
  icon = null,
  /** What is empty. One short line - it is a heading, not a sentence. */
  title,
  /** What to do about it. One sentence, or nothing. */
  body = null,
  /** The way out - usually a <Button>. */
  action = null,
  tone = 'calm',
  /** `sm` for an empty state inside a card or section rather than a page. */
  size = 'md',
  className = '',
}) {
  const sm = size === 'sm'
  return (
    <div className={cx('text-center', sm ? 'px-6 py-8' : 'px-8 py-12', className)}>
      {icon && (
        <div
          className={cx(
            'mx-auto rounded-full flex items-center justify-center',
            sm ? 'w-11 h-11' : 'w-14 h-14',
            TONE[tone] ?? TONE.calm,
          )}
        >
          {icon}
        </div>
      )}

      <p
        className={cx(
          'font-semibold text-slate-800 dark:text-white',
          sm ? 'text-[14px]' : 'text-[15px]',
          icon && 'mt-4',
        )}
      >
        {title}
      </p>

      {body && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          {body}
        </p>
      )}

      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
