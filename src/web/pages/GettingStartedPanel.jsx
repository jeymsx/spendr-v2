import { useNavigate } from 'react-router-dom'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import { Progress } from '../ui/display'
import { GlyphTile } from '../../components/help/HelpGlyph'

/** @typedef {ReturnType<typeof import('../../hooks/useGettingStarted').default>} GS */

/**
 * Getting started on a computer (lib/gettingStarted.js): every step at once,
 * as tiles across the panel, because a desk has the width the phone's card
 * does not. A step that is not done opens where it is done - a form opens in
 * the panel at the right, over Home (web/ui/RouteDrawer) - and ticks itself
 * off when you come back.
 *
 * Above the news on the Notifications page, the one place the list lives.
 * Draws nothing when there is no list.
 *
 * @param {{gs: GS, className?: string}} props
 */
export default function GettingStartedPanel({ gs, className = '' }) {
  const navigate = useNavigate()
  if (!gs.on) return null

  if (gs.complete) {
    return (
      <Panel className={className}>
        <div className="flex items-center gap-4">
          <GlyphTile name="check" color="#10B981" on />
          <div className="flex-1 min-w-0">
            <p className="text-15 font-semibold text-[var(--d-text)]">You’re all set</p>
            <p className="text-13 text-[var(--d-text-3)]">Every first step is done. Spendr has what it needs to keep your month in order.</p>
          </div>
          <Btn variant="tint" onClick={gs.hide}>Done</Btn>
        </div>
      </Panel>
    )
  }

  return (
    <Panel
      className={className}
      title="Getting started"
      meta={`${gs.doneCount} of ${gs.total} done`}
      actions={(
        <>
          <Btn variant="ghost" size="sm" onClick={() => navigate('/help/getting-started-list')}>How it works</Btn>
          <Btn variant="ghost" size="sm" onClick={gs.hide}>Hide</Btn>
        </>
      )}
    >
      <Progress value={(gs.doneCount / gs.total) * 100} className="mb-5" label="Getting started" />
      <div className="d-gs-grid">
        {gs.steps.map(s => (
          <button
            key={s.id}
            type="button"
            disabled={s.done}
            onClick={() => navigate(s.to)}
            className={`d-gs-step${s.done ? ' is-done' : ''}`}
          >
            <GlyphTile name={s.done ? 'check' : s.glyph} color={s.done ? '#10B981' : undefined} on={s.done} />
            <span className="min-w-0">
              <span className="d-gs-step-title">{s.title}</span>
              <span className="d-gs-step-hint">{s.done ? 'Done' : (s.blocked ?? s.hint)}</span>
            </span>
          </button>
        ))}
      </div>
    </Panel>
  )
}
