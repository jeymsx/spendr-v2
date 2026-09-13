/**
 * A segmented control: one track, equal segments, the selection sliding
 * between them. The platform control for a small mutually-exclusive choice,
 * and it cannot produce an orphan the way wrapping chips do.
 *
 * Only for two or three options - past that the labels get too narrow to
 * read, which is what a tile grid is for.
 *
 * ── Why it is here rather than in the create flow ──
 *
 * It was defined in pages/accounts/NewFields.jsx, next to its only caller.
 * Then the edit form turned out to ask the same question - "Counts as",
 * spending or savings - and answered it with a pair of filled blue buttons
 * instead. One question, two controls, two shapes, depending on whether you
 * had just made the account or come back to it.
 *
 * A control used by two screens is a ui/ component. Nothing about it knows
 * what an account is.
 */
export default function Segmented({ options, value, onChange }) {
  const index = Math.max(0, options.findIndex(o => o.value === value))
  /* A capsule, like every other field and button in the app - the track and
     the thumb both, so the thumb's curve sits concentric inside the track's
     rather than cutting across it. The track keeps its fill and hairline: the
     unchosen half has to read as part of one control, not as empty space
     beside a button. */
  return (
    <div
      className="relative flex p-1 rounded-full bg-slate-100 dark:bg-white/[0.06]
        border border-slate-200/70 dark:border-white/[0.06]"
      role="radiogroup"
    >
      {/* The moving thumb, sized as a fraction of the track so it lands on
          each segment exactly however many there are. */}
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 rounded-full bg-white dark:bg-white/[0.14]
          shadow-sm transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          left: 4,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 flex-1 py-2 text-13 font-semibold rounded-full
            transition-colors duration-150 ${
              value === o.value
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
