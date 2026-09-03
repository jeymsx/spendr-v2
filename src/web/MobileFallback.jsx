/**
 * Renders an as-yet-unconverted mobile page inside the desktop shell.
 *
 * This is what makes the desktop UI usable from the first commit: every route
 * works immediately, and pages get a real landscape layout one at a time
 * instead of in one big rewrite.
 *
 * The page is held to a phone-ish column rather than stretched to 1400px,
 * because these layouts were designed for ~390px and stretching them looks
 * broken. Framed and labelled so it reads as deliberate.
 *
 * Known rough edge while a page is still in fallback: its bottom sheets are
 * positioned with inline Tailwind (`fixed bottom-0 inset-x-0`), not the CSS
 * classes, so they still slide up the full width of the window. Functional,
 * slightly phone-ish, and fixed when that page gets its desktop layout.
 */
export default function MobileFallback({ title, children }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-[520px]">
        {title && (
          <div className="flex items-center justify-between mb-3 px-1">
            <h1 className="text-lg font-semibold text-slate-800 dark:text-white">{title}</h1>
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full
              bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
              Compact view
            </span>
          </div>
        )}
        <div className="card rounded-3xl overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
