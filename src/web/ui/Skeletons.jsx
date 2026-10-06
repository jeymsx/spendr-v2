import { useLocation } from 'react-router-dom'
import { Skeleton } from './display'

/**
 * Grey shapes where a desktop page's content is about to be - the same
 * figures, rows, cards and panels it will have, so the page arrives into its
 * own outline instead of flashing empty. The phone has had these all along
 * (components/ui/Skeleton); these are the desktop's, drawn with its tokens
 * (pro.css `.d-skel`), and still under Reduce motion.
 *
 * Each page has its own: Notes is a list and an editor, Settings a column of
 * links and a pane, Notifications one narrow card of rows. RouteSkeleton
 * picks the page's while its code arrives (WebLayout), and the pages use the
 * same parts while their reads do.
 */

// ── Parts ──────────────────────────────────────────────────────────────────

/** One figure card: its label, its figure, the line under it. */
export function StatCardSkeleton() {
  return (
    <div className="d-panel px-6 py-5" aria-hidden="true">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-4 h-7 w-36" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  )
}

/** A row of figure cards, four (or three, as Net worth has). @param {{count?: 3|4}} props */
export function StatsSkeleton({ count = 4 }) {
  return (
    <div className={`${count === 3 ? 'grid-cols-3' : 'd-stats grid-cols-4'} grid gap-5 mb-8`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <StatCardSkeleton key={i} />)}
    </div>
  )
}

/**
 * Table rows, for a table's empty slot while it loads: a tile, a name and a
 * line under it, a figure at the right - a ledger row's shape.
 *
 * @param {{rows?: number}} props
 */
export function RowsSkeleton({ rows = 6 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 h-[52px] px-6 border-b border-[var(--d-border)] last:border-b-0">
          <Skeleton className="h-8 w-8 rounded-[10px] shrink-0" />
          <Skeleton className="h-3.5" style={{ width: `${28 + ((i * 37) % 30)}%` }} />
          <span className="flex-1" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  )
}

/** One account card, at the real ones' shape on a computer (pro.css .d-card-grid). */
export function CardSkeleton() {
  return <Skeleton className="rounded-[18px]" style={{ aspectRatio: '1.586' }} />
}

/**
 * Accounts' cards view: a pile's heading and total, then its cards.
 *
 * @param {{cards?: number}} props
 */
export function CardsSkeleton({ cards = 4 }) {
  return (
    <section className="mb-8" aria-hidden="true">
      <div className="d-section-head"><Skeleton className="h-5 w-28" /><Skeleton className="h-4 w-20" /></div>
      <div className="d-card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {Array.from({ length: cards }, (_, i) => <CardSkeleton key={i} />)}
      </div>
    </section>
  )
}

/** A panel: its title, then rows. @param {{rows?: number, className?: string}} props */
export function PanelSkeleton({ rows = 5, className = '' }) {
  return (
    <div className={`d-panel ${className}`} aria-hidden="true">
      <div className="d-panel-head"><Skeleton className="h-4 w-32" /></div>
      <RowsSkeleton rows={rows} />
    </div>
  )
}

/** A panel with a chart in it: its title, then the chart's area. @param {{height?: number, className?: string}} props */
export function ChartPanelSkeleton({ height = 260, className = '' }) {
  return (
    <div className={`d-panel ${className}`} aria-hidden="true">
      <div className="d-panel-head"><Skeleton className="h-4 w-40" /></div>
      <div className="d-panel-body"><Skeleton className="rounded-[14px]" style={{ height }} /></div>
    </div>
  )
}

/**
 * A table in its panel: the filters along its top when it has them, its
 * column heads, and rows - under a date's band every few, when the rows are
 * grouped by day (Transactions).
 *
 * @param {{rows?: number, toolbar?: boolean, groups?: boolean, title?: boolean, className?: string}} props
 */
export function TableSkeleton({ rows = 6, toolbar = false, groups = false, title = false, className = '' }) {
  return (
    <div className={`d-panel overflow-hidden ${className}`} aria-hidden="true">
      {title && <div className="d-panel-head"><Skeleton className="h-4 w-32" /></div>}
      {toolbar && (
        <div className="flex items-center gap-3 h-[72px] px-5 border-b border-[var(--d-border)]">
          <Skeleton className="h-10 w-[300px] rounded-full" />
          <Skeleton className="h-10 w-[300px] rounded-full" />
          <span className="flex-1" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      )}
      <div className="flex items-center gap-10 h-11 px-6 border-b border-[var(--d-border)]">
        <Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-20" /><span className="flex-1" /><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-14" />
      </div>
      {Array.from({ length: groups ? Math.ceil(rows / 2) : 1 }, (_, g) => (
        <div key={g}>
          {groups && <div className="flex items-center h-10 px-6 bg-[var(--d-subtle)] border-b border-[var(--d-border)]"><Skeleton className="h-3 w-28" /></div>}
          <RowsSkeleton rows={groups ? 2 : rows} />
        </div>
      ))}
    </div>
  )
}

/** A page's title: the line over it, the title, the line under it, and its buttons. */
function HeadSkeleton({ eyebrow = false, sub = true, actions = 1, media = null }) {
  return (
    <div className="d-page-head" aria-hidden="true">
      <div className="min-w-0">
        {eyebrow && <Skeleton className="h-3.5 w-28 mb-3" />}
        <div className="flex items-center gap-4">
          {media}
          <div>
            <Skeleton className="h-8 w-48" />
            {sub && <Skeleton className="mt-3 h-4 w-32" />}
          </div>
        </div>
      </div>
      {actions > 0 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: actions }, (_, i) => <Skeleton key={i} className="h-10 w-28 rounded-full" />)}
        </div>
      )}
    </div>
  )
}

/** The tabs over a page's list. @param {{tabs?: number}} props */
function TabsSkeleton({ tabs = 4 }) {
  return (
    <div className="flex items-center gap-2 mb-6" aria-hidden="true">
      {Array.from({ length: tabs }, (_, i) => <Skeleton key={i} className="h-10 w-24 rounded-full" />)}
    </div>
  )
}

const SPLITS = {
  '8/4': ['col-span-8 d-main', 'col-span-4 d-side'],
  '7/5': ['col-span-7', 'col-span-5'],
  '5/7': ['col-span-5 d-side', 'col-span-7 d-main'],
}

/**
 * Insights' Overview, Spending and Trend while the period is read: the
 * figures, the cash flow across the width, then two panels.
 */
export function InsightsSkeleton() {
  return (
    <div aria-hidden="true">
      <StatsSkeleton />
      <ChartPanelSkeleton height={320} className="mb-8" />
      <div className="grid grid-cols-12 gap-5">
        <PanelSkeleton rows={5} className="col-span-7" />
        <PanelSkeleton rows={5} className="col-span-5" />
      </div>
    </div>
  )
}

/**
 * A page's body: a row of figures, then two panels side by side.
 *
 * @param {{split?: keyof typeof SPLITS}} props
 */
export function BoardSkeleton({ split = '8/4' }) {
  const [wide, narrow] = SPLITS[split]
  return (
    <div aria-hidden="true">
      <StatsSkeleton />
      <div className="grid grid-cols-12 gap-5">
        <PanelSkeleton rows={7} className={wide} />
        <PanelSkeleton rows={4} className={narrow} />
      </div>
    </div>
  )
}

// ── Pages of one thing ─────────────────────────────────────────────────────

/** The picture and name at the top of a one-thing page, and its chips. @param {{round?: boolean}} props */
function DetailHead({ round = false }) {
  return (
    <div className="flex items-center gap-4 mb-7">
      <Skeleton className={`h-16 w-16 shrink-0 ${round ? 'rounded-full' : 'rounded-[20px]'}`} />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-8 w-56" />
        <div className="mt-3 flex gap-2"><Skeleton className="h-7 w-24 rounded-full" /><Skeleton className="h-7 w-32 rounded-full" /></div>
      </div>
    </div>
  )
}

/** A label-and-value list (a bill's details). @param {{rows?: number}} props */
function FactsSkeleton({ rows = 4 }) {
  return (
    <div className="d-panel col-span-5 d-side self-start">
      <div className="d-panel-head"><Skeleton className="h-4 w-24" /></div>
      <div className="d-panel-body flex flex-col gap-5 pt-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-10"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-3.5 w-28" /></div>
        ))}
      </div>
    </div>
  )
}

/**
 * A one-thing page while it loads, in that page's own shape: an account
 * (its chart, then its rows), a goal (its ring, and what funds it), a bill
 * (its details, and what it has charged), a person (every entry).
 *
 * @param {{kind?: 'account'|'goal'|'bill'|'person'}} props
 */
export function DetailSkeleton({ kind = 'account' }) {
  return (
    <div aria-hidden="true">
      <DetailHead round={kind === 'person'} />
      <StatsSkeleton />
      {kind === 'account' && (
        <>
          <ChartPanelSkeleton height={220} className="mb-5" />
          <TableSkeleton rows={5} title />
        </>
      )}
      {kind === 'goal' && (
        <div className="grid grid-cols-12 gap-5">
          <div className="d-panel col-span-5 d-side">
            <div className="d-panel-head"><Skeleton className="h-4 w-24" /></div>
            <div className="d-panel-body flex flex-col items-center pb-8">
              <Skeleton className="h-[200px] w-[200px] rounded-full" />
              <Skeleton className="mt-8 h-7 w-40" />
              <Skeleton className="mt-3 h-3.5 w-24" />
            </div>
          </div>
          <PanelSkeleton rows={2} className="col-span-7 d-main self-start" />
        </div>
      )}
      {kind === 'bill' && (
        <div className="grid grid-cols-12 gap-5">
          <FactsSkeleton />
          <TableSkeleton rows={6} title className="col-span-7 d-main" />
        </div>
      )}
      {kind === 'person' && <TableSkeleton rows={3} title />}
    </div>
  )
}

// ── Notes, Settings, Notifications, Achievements ───────────────────────────

/** Notes' list: its search, a day, and notes - a title and the line under it - in one card. @param {{notes?: number}} props */
export function NoteListSkeleton({ notes = 4 }) {
  return (
    <div className="px-5" aria-hidden="true">
      <Skeleton className="h-[38px] rounded-full" />
      <Skeleton className="mt-6 h-3 w-14" />
      <div className="mt-3 d-panel">
        {Array.from({ length: notes }, (_, i) => (
          <div key={i} className="px-4 py-4 border-b border-[var(--d-border)] last:border-b-0">
            <Skeleton className="h-4" style={{ width: `${46 + ((i * 23) % 30)}%` }} />
            <Skeleton className="mt-2.5 h-3 w-[60%]" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A note opening: the editor's bar, the date, a title and a few lines. */
export function NoteEditorSkeleton() {
  return (
    <div className="p-5" aria-hidden="true">
      <Skeleton className="h-[42px] rounded-[16px]" />
      <Skeleton className="mt-5 mx-auto h-3 w-40" />
      <Skeleton className="mt-7 h-8 w-56" />
      {[88, 94, 72, 81, 40].map((w, i) => <Skeleton key={i} className="mt-4 h-3.5" style={{ width: `${w}%` }} />)}
    </div>
  )
}

/** Settings' column of links: four groups under their headings. */
function SettingsNavSkeleton() {
  return (
    <div className="d-panel p-2" aria-hidden="true">
      {[4, 4, 3, 2].map((n, g) => (
        <div key={g} className="pb-1">
          <Skeleton className="mx-3 mt-3 mb-2.5 h-3 w-16" />
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="flex items-center gap-3 h-10 px-3">
              <Skeleton className="h-4 w-4 rounded-md" /><Skeleton className="h-3.5" style={{ width: `${44 + ((g * 3 + i) * 17) % 34}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** The right half of Settings or Notes while it loads: a title and a panel of rows. */
export function PaneSkeleton() {
  return (
    <div className="px-5" aria-hidden="true">
      <Skeleton className="h-7 w-44 mb-5" />
      <PanelSkeleton rows={5} />
    </div>
  )
}

/** Notifications: one card, a day's heading, and rows of an icon, two lines and a time. */
function NotificationsSkeleton() {
  return (
    <div className="d-panel px-6 pt-5 pb-3" aria-hidden="true">
      <Skeleton className="h-3 w-14 mb-3" />
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-start gap-4 py-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-3.5" style={{ width: `${30 + ((i * 29) % 26)}%` }} />
            <Skeleton className="mt-2.5 h-3" style={{ width: `${44 + ((i * 41) % 30)}%` }} />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  )
}

/** One of Achievements' four cards at the top: its label and picture, its figure, its bar. */
export function AchCardSkeleton() {
  return (
    <div className="d-panel d-ach-card" aria-hidden="true">
      <span className="flex items-start justify-between gap-2 w-full">
        <Skeleton className="h-3.5 w-24" /><Skeleton className="h-8 w-8 rounded-full -mt-1" />
      </span>
      <Skeleton className="mt-4 h-7 w-24" />
      <Skeleton className="mt-3 h-3 w-36 mb-4" />
      <Skeleton className="mt-auto h-1.5 w-full rounded-full" />
    </div>
  )
}

/** A challenge, as the collection lays them out: its shield, its name and rule, its button. */
export function ChallengeCardsSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-3.5 w-24 mb-3" />
      <div className="grid grid-cols-3 gap-5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="d-panel flex items-start gap-3 px-4 py-4 h-[138px]">
            <Skeleton className="h-10 w-10 rounded-[14px] shrink-0" />
            <div className="flex-1 min-w-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2.5 h-3 w-[90%]" />
              <Skeleton className="mt-2 h-3 w-[60%]" />
              <Skeleton className="mt-4 h-8 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Whole pages, while their code arrives ─────────────────────────────────

/** Home: the greeting, the wallet and its four figures, a row of cards, the chart and what is due. */
function HomeSkeleton() {
  return (
    <>
      <div className="d-page-head"><div><Skeleton className="h-3.5 w-36 mb-3" /><Skeleton className="h-9 w-80" /></div></div>
      <div className="grid grid-cols-12 gap-5 mb-8">
        <Skeleton className="col-span-5 h-[268px] rounded-[30px]" />
        <div className="col-span-7 grid grid-cols-2 gap-5">{[0, 1, 2, 3].map(i => <StatCardSkeleton key={i} />)}</div>
      </div>
      <div className="d-section-head"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-14" /></div>
      <div className="d-card-grid mb-8" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        {[0, 1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
      </div>
      <div className="grid grid-cols-12 gap-5">
        <ChartPanelSkeleton className="col-span-8 d-main" />
        <PanelSkeleton rows={5} className="col-span-4 d-side" />
      </div>
    </>
  )
}

/**
 * A page while its code arrives, in that page's own shape - picked by the
 * address, as WebApp's routes are. Anything not named here gets the plain
 * outline: a title, a row of figures, two panels.
 */
export function RouteSkeleton() {
  const { pathname } = useLocation()
  const [, section = '', sub] = pathname.split('/')
  let width = 1400
  /** @type {import('react').ReactNode} */
  let body
  if (!section) body = <HomeSkeleton />
  else if (section === 'transactions') body = <><HeadSkeleton actions={2} /><StatsSkeleton /><TableSkeleton rows={8} toolbar groups /></>
  else if (section === 'accounts' && sub && sub !== 'new') body = <><Skeleton className="h-3.5 w-20 mb-4" /><DetailSkeleton kind="account" /></>
  else if (section === 'accounts') body = <><HeadSkeleton actions={2} /><StatsSkeleton /><CardsSkeleton cards={4} /><CardsSkeleton cards={2} /></>
  else if (section === 'insights') body = <><HeadSkeleton eyebrow sub={false} actions={1} /><TabsSkeleton tabs={5} /><InsightsSkeleton /></>
  else if (section === 'budget') body = <><HeadSkeleton eyebrow sub={false} /><BoardSkeleton /></>
  else if (section === 'goals' && sub) body = <><Skeleton className="h-3.5 w-16 mb-4" /><DetailSkeleton kind="goal" /></>
  else if (section === 'goals') {
    body = (
      <>
        <HeadSkeleton />
        <StatsSkeleton />
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-8 d-main grid gap-5 self-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {[0, 1].map(i => (
              <div key={i} className="d-panel flex items-center gap-5 p-6">
                <Skeleton className="h-[84px] w-[84px] rounded-full shrink-0" />
                <div className="flex-1"><Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-4 w-44" /><Skeleton className="mt-3 h-3 w-36" /></div>
              </div>
            ))}
          </div>
          <PanelSkeleton rows={2} className="col-span-4 d-side self-start" />
        </div>
      </>
    )
  } else if (section === 'recurring' && sub && sub !== 'new') body = <><Skeleton className="h-3.5 w-24 mb-4" /><DetailSkeleton kind="bill" /></>
  else if (section === 'recurring') {
    body = (
      <>
        <HeadSkeleton />
        <StatsSkeleton />
        <TabsSkeleton />
        <div className="grid grid-cols-12 gap-5"><TableSkeleton rows={5} className="col-span-8 d-main self-start" /><PanelSkeleton rows={2} className="col-span-4 d-side self-start" /></div>
      </>
    )
  } else if (section === 'debts' && sub === 'person') body = <><Skeleton className="h-3.5 w-16 mb-4" /><DetailSkeleton kind="person" /></>
  else if (section === 'debts') body = <><HeadSkeleton /><StatsSkeleton /><TabsSkeleton tabs={3} /><TableSkeleton rows={4} /></>
  else if (section === 'categories') {
    body = (
      <>
        <HeadSkeleton eyebrow actions={1} media={<Skeleton className="h-12 w-12 rounded-[14px]" />} />
        <StatsSkeleton />
        <ChartPanelSkeleton height={220} className="mb-5" />
        <TableSkeleton rows={5} title />
      </>
    )
  } else if (section === 'notes') {
    body = (
      <>
        <HeadSkeleton sub={false} />
        <div className="d-twopane d-notes" style={{ '--side': '300px' }}>
          <div className="d-twopane-side d-twopane-list min-w-0"><NoteListSkeleton /></div>
          <div className="d-twopane-main d-panel d-note-card min-w-0"><NoteEditorSkeleton /></div>
        </div>
      </>
    )
  } else if (section === 'settings') {
    body = (
      <>
        <HeadSkeleton actions={0} />
        <div className="d-twopane" style={{ '--side': '264px' }}>
          <div className="d-twopane-side"><SettingsNavSkeleton /></div>
          <div className="d-twopane-main min-w-0"><PaneSkeleton /></div>
        </div>
      </>
    )
  } else if (section === 'notifications') {
    width = 980
    body = <><HeadSkeleton actions={0} /><NotificationsSkeleton /></>
  } else if (section === 'achievements' || section === 'badges') {
    body = (
      <>
        <HeadSkeleton actions={0} />
        <div className="d-stats grid grid-cols-4 gap-5 mb-8">{[0, 1, 2, 3].map(i => <AchCardSkeleton key={i} />)}</div>
        <TabsSkeleton tabs={3} />
        <ChallengeCardsSkeleton />
      </>
    )
  } else body = <><HeadSkeleton /><BoardSkeleton /></>
  return (
    <div className="d-page" aria-hidden="true">
      <div className="d-page-inner" style={{ maxWidth: width }}>{body}</div>
    </div>
  )
}

/** The plain outline: a title, a row of figures, two panels. */
export function PageSkeleton() {
  return (
    <div className="d-page" aria-hidden="true">
      <div className="d-page-inner" style={{ maxWidth: 1400 }}>
        <HeadSkeleton />
        <BoardSkeleton />
      </div>
    </div>
  )
}
