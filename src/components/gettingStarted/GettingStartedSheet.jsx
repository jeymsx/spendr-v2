import { useNavigate } from 'react-router-dom'
import Sheet from '../ui/Sheet'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Divider from '../ui/Divider'
import { GlyphTile } from '../help/HelpGlyph'
import HelpGlyph from '../help/HelpGlyph'
import { IconChevronRight } from '../icons'

/**
 * The whole Getting started list: each step, whether it is done, and the way
 * to it. Opened from the row pinned at the top of the notifications
 * (GettingStartedPin).
 *
 * A step that is done stays in the list, ticked, rather than leaving it: the
 * count only means something next to what it counts. One that is not done
 * goes to where it is done; the sheet closes first, so Back from there comes
 * back to the notifications rather than to a sheet that was already dismissed.
 *
 * @param {{open: boolean, onClose: () => void, gs: ReturnType<typeof import('../../hooks/useGettingStarted').default>}} props
 */
export default function GettingStartedSheet({ open, onClose, gs }) {
  const navigate = useNavigate()
  const go = (/** @type {string} */ to) => { onClose(); navigate(to) }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Getting started"
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" block onClick={() => { gs.hide(); onClose() }}>Hide the list</Button>
          <Button variant="tint" block onClick={() => go('/help/getting-started-list')}>How it works</Button>
        </div>
      )}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed -mt-1 mb-4">
        {gs.complete
          ? 'Every step is done. Spendr has what it needs to keep your month in order.'
          : `${gs.doneCount} of ${gs.total} done. Each one ticks itself off once you’ve done it.`}
      </p>
      <Card surface="recessed" radius="2xl" clip>
        {gs.steps.map((s, i) => (
          <div key={s.id}>
            {i > 0 && <Divider inset="glyph" />}
            <button
              type="button"
              onClick={() => !s.done && go(s.to)}
              disabled={s.done}
              className="w-full flex items-center gap-3 px-4 py-3 text-left enabled:active:bg-slate-100 dark:enabled:active:bg-white/[0.04] transition-colors"
            >
              <GlyphTile name={s.done ? 'check' : s.glyph} color={s.done ? '#10B981' : undefined} on={s.done} />
              <span className="flex-1 min-w-0">
                <span className={`block text-15 font-semibold leading-snug ${s.done ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                  {s.title}
                </span>
                <span className="block text-13 text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                  {s.done ? 'Done' : (s.blocked ?? s.hint)}
                </span>
              </span>
              {!s.done && <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight size={18} /></span>}
            </button>
          </div>
        ))}
      </Card>
      <p className="mt-4 flex items-center gap-1.5 text-13 text-slate-500 dark:text-slate-400">
        <HelpGlyph name="bulb" size={15} />
        You can bring this back from Help.
      </p>
    </Sheet>
  )
}
