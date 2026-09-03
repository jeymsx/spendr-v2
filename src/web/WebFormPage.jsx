/**
 * Presents one of the mobile form pages as a desktop form card.
 *
 * Add-expense, add-income, transfer and the CSV importer are single-column
 * forms with essentially no mobile-shell coupling — no scroll locks, no bottom
 * sheets of their own, just safe-area padding that is zero on a desktop. So
 * they are reused whole rather than rebuilt, which keeps one implementation of
 * the parts that matter: installment scheduling, the overdraw guard, duplicate
 * detection, templates and the credit-aware account picker.
 *
 * A form is one task, so it gets a centred column instead of the full 1400px —
 * stretching a labelled field row across a wide screen makes it harder to read,
 * not easier. This is different from MobileFallback: no "compact view" badge,
 * because this is the intended desktop presentation rather than a placeholder.
 *
 * `title` is optional and normally omitted: each of these forms renders its own
 * header with a back button, and adding a second one above it reads as a
 * duplicate. It exists for any future form that has no header of its own.
 */
export default function WebFormPage({ title, subtitle, width = 560, children }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full" style={{ maxWidth: width }}>
        {title && (
          <div className="mb-5">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
            )}
          </div>
        )}
        {/* The form's own back button and header sit inside; the card frames it. */}
        {/* card-solid, not .card: same material, composited opaque, because a
            .card host is translucent over content and its backdrop-filter
            would make it the containing block for the form's own fixed
            pickers. overflow-hidden is gone because it clipped them. */}
        <div className="card-solid rounded-2xl">
          {children}
        </div>
      </div>
    </div>
  )
}
