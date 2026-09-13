// ── Layout primitives ──────────────────────────────────────────────────────────

/* Not a <SectionLabel>. This is the page's section HEADING - 16px slate-800,
   the same recipe Dashboard's `<h2>` and every screen's title bar use - and it
   carries a control on the right (the chart's Expenses/Income/Net flow
   switch). The shared SectionLabel is the 12px slate-500 caption; using it
   here would mute a page heading down to a caption and drop the action slot. */
/* Was a local 16px h2 with px-5 and mb-3 baked in. It is
   components/ui/SectionHeading.jsx now - Dashboard had the same heading with
   a different prop list and a different row alignment. Re-exported under the
   name this module's three callers already import. */
export { default as SectionHeading } from '../../components/ui/SectionHeading'
