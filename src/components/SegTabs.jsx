/**
 * The app's segmented control: bare labels, no track, one glass pill that
 * slides.
 *
 * It started life inline in Insights, where the shape was worked out: a flat
 * tint holding a flat white pill, then a glass track with a hairline rim -
 * which looked right in the middle and wrong at both ends, because the pill's
 * rounded edge landed a hair inside the track's and read as a double outline.
 * There is nothing for a track to do that the pill is not already doing. N
 * equal-width adjacent labels read as one control on their own, and the pill
 * says which is on.
 *
 * It lives here because Bills and Debts both needed it, and the alternative
 * was a third copy. Two pages running slightly different segmented controls is
 * exactly the kind of drift that made the Debts page look like it came from
 * another app - it had a slate-100 trough holding a white pill, which is a web
 * tab strip rather than an iOS control.
 *
 * Equal-width segments are what make the travel work: the thumb is 100%/N and
 * moves by multiples of its own width, which only lands correctly if every
 * segment is the same size. `flex-1` guarantees that whatever the labels say.
 *
 * The colour arrives as --seg-color so the label class can answer the theme;
 * an inline style cannot. Measured, the accent as text is 2.85:1 on white and
 * 2.63:1 on its own 8% tint, both under the 4.5:1 small bold text needs, so
 * .seg-active mixes it 65% into black for light mode and leaves it as-is in
 * dark, where it already passes.
 */
export default function SegTabs({ tabs, value, onChange, color = 'var(--color-primary)' }) {
  const idx = Math.max(0, tabs.findIndex(t => t.value === value))
  return (
    <div className="relative flex items-center">
      <div
        className="absolute inset-y-0 left-0 rounded-full border backdrop-blur-md pointer-events-none"
        style={{
          width: `calc(100% / ${tabs.length})`,
          transform: `translateX(${idx * 100}%)`,
          transition: 'transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1)',
          // color-mix rather than a string-concatenated alpha suffix: the
          // accent is `var(--color-primary)`, and 'var(--color-primary)' + '22'
          // is not a colour.
          backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
          borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        }}
      />
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          aria-pressed={value === t.value}
          className={[
            'relative z-10 flex-1 py-1.5 px-1 text-[12px] font-semibold rounded-full truncate',
            'transition-colors duration-200',
            value === t.value ? 'seg-active' : 'text-slate-500 dark:text-slate-400',
          ].join(' ')}
          style={value === t.value ? { '--seg-color': color } : undefined}
        >
          {t.label}
          {t.count > 0 && (
            <span className="ml-1 tabular-nums opacity-60">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}
