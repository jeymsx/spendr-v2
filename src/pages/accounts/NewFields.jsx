import BrandWatermark from '../../components/BrandWatermark'
import { accountBrand } from '../../lib/accountBrands'
import { IconCheck } from '../../components/icons'

// ── Field furniture ────────────────────────────────────────────────────────────

/* The section header used to be defined here - a 13px semibold in slate-700,
   which is the size and weight of the content it labels. It is
   components/ui/SectionLabel now, along with the other 64 captions in the app.

   Its `hint` prop did not come along: SectionLabel has no hint, so the three
   labels that carry one spell out the line beneath them. */

export const inputCls = (bad = false) =>
  `w-full px-4 py-3.5 rounded-2xl text-[15px] tabular-nums
   bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white
   border ${bad ? 'border-red-400 dark:border-red-500/60' : 'border-slate-200 dark:border-white/[0.09]'}
   placeholder:text-slate-400 dark:placeholder:text-slate-500
   focus:outline-none focus:border-primary/60`

/* Segmented used to be defined here, beside its only caller. The edit form
   asks the same question now, so it is components/ui/Segmented.jsx - see the
   note at the top of it. */

/**
 * One institution in the picker.
 *
 * A tile rather than a list row, which is the answer to the list being too
 * long: forty rows is several screens of scrolling, while forty tiles in
 * three columns is fourteen rows. Recognition does the work here - you find
 * your bank by its colour and mark, not by reading its name - so the mark is
 * the tile and the name is only its caption.
 *
 * The mark is the same art as the card watermark, reused through
 * BrandWatermark with a class that renders it at full strength instead of at
 * 10% in a corner. Institutions with no logo file get their monogram from the
 * same component, so there is one code path for all three cases.
 */
export function BrandTile({ preset, selected, onPick }) {
  const brand = accountBrand(preset)
  return (
    <button
      type="button"
      onClick={() => onPick(preset)}
      aria-pressed={selected}
      className="flex flex-col items-center gap-1 rounded-xl
        active:scale-[0.94] transition-transform duration-75"
    >
      <span
        className={`relative w-full aspect-square rounded-xl flex items-center justify-center
          overflow-hidden ${
            selected
              ? 'ring-2 ring-primary ring-offset-1 ring-offset-white dark:ring-offset-[#0b0f14]'
              : ''
          }`}
        style={{ background: `linear-gradient(135deg, ${brand.from}, ${brand.to})` }}
      >
        <BrandWatermark brand={brand} className="brand-glyph" />
        {selected && (
          <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-white text-primary
            flex items-center justify-center shadow">
            <IconCheck />
          </span>
        )}
      </span>
      <span className={`text-[9px] leading-[1.15] text-center line-clamp-2 ${
        selected ? 'font-semibold text-primary' : 'text-slate-600 dark:text-slate-300'
      }`}>
        {preset.name}
      </span>
    </button>
  )
}

/** The step indicator. Rendered above the card on the final step and below
 *  it on the others, so it is a component rather than two copies. */
export function StepProgress({ steps, index, className = '' }) {
  return (
    <div className={`px-5 flex items-center gap-1.5 ${className}`} role="presentation">
      {steps.map((s, i) => (
        <span
          key={s}
          className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
            i <= index ? 'bg-primary' : 'bg-slate-200 dark:bg-white/[0.10]'
          }`}
        />
      ))}
    </div>
  )
}
