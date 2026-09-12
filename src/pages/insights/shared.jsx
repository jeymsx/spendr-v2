// ── Layout primitives ──────────────────────────────────────────────────────────

/* Not a <SectionLabel>. This is the page's section HEADING - 16px slate-800,
   the same recipe Dashboard's `<h2>` and every screen's title bar use - and it
   carries a control on the right (the chart's Expenses/Income/Net flow
   switch). The shared SectionLabel is the 12px slate-500 caption; using it
   here would mute a page heading down to a caption and drop the action slot. */
export function SectionHeading({ children, action }) {
  return (
    <div className="px-5 flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold text-slate-800 dark:text-white">{children}</h2>
      {action}
    </div>
  )
}
