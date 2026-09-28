import { cx } from './cx'
import { GlassArt } from '../glass/GlassArt'
import { useTheme } from '../../context/ThemeContext'
import { useReduceMotion } from '../../hooks/useReduceMotion'

/**
 * Nothing here, in the app's own voice.
 *
 * ── What it settles ──
 *
 * Four of these were written as components (Debts, Bills, Transactions, the
 * dashboard's pill) and four more inline (Goals, Budget, Accounts, the
 * account detail). Debts' and Bills' were byte-for-byte the same shape;
 * Transactions' was a 20px squircle holding a 36px icon over 14px and 12px
 * text, which is a different design for the same moment.
 *
 * The Debts/Bills shape wins because two screens had already converged on
 * it: a picture, a 15px semibold line saying what is empty, a 13px line
 * saying what to do about it, and - only sometimes - the way out.
 *
 * ── The picture is glass ──
 *
 * It was a flat glyph in a tinted 56px disc. It is one of the glass pictures
 * now (components/glass), the same drawings the desktop's empty panes, the
 * setup screens and the achievements are made of, so an empty screen reads
 * as part of the app rather than as a placeholder waiting for one. `art`
 * names the picture. `icon` still draws the old disc for anything that passes
 * one, but nothing in the app does.
 *
 * The box is 88px (64 in a card), bigger than the disc was, because a glass
 * picture's subject fills only the middle three quarters of its box - the
 * rest is room for its shadow. That margin is also why the title sits closer
 * to the picture than it did to the disc: the gap you see is the same.
 *
 * It comes together once, with the CSS entrance GlassArt already has, and
 * then holds still - no float, no shine crossing it. An empty screen is
 * somewhere you stay for a moment and act from, and a picture bobbing on a
 * loop there is asking to be looked at. Under reduced motion it is the still
 * picture from the start. None of it is Motion: this is on the home screen,
 * the one route that is not lazy-loaded, so it costs nothing new there.
 *
 * ── One line each ──
 *
 * `body` is one sentence. Debts' used to carry two apiece explaining how
 * debts work, which is not what an empty state is for; it is for saying the
 * list is empty and offering the way out of that. If the copy needs a second
 * sentence, the screen needs onboarding, not a longer empty state.
 *
 * ── tone ──
 *
 * An empty list is usually neutral - there is nothing here yet - and the
 * picture is drawn in the accent, as every other glass picture in the app is.
 * It is not drawn grey: grey glass is what a locked achievement looks like,
 * and an empty list is not something withheld. Sometimes empty is GOOD news:
 * no bills due, nothing owing, nothing stored twice. Those read wrong in the
 * everyday colour, so `tone="good"` draws the picture green. That is the only
 * reason a second tone exists.
 */

const TONE = {
  calm: 'bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500',
  good: 'bg-emerald-50 dark:bg-emerald-500/[0.12] text-emerald-600 dark:text-emerald-400',
}

/** The emerald the achievements draw good news in (TONE_HUE in lib/achievements.js). */
const GOOD_HUE = '#099268'

export default function EmptyState({
  /** A glass picture, by name - one of GLASS_NAMES in components/glass/glass.js. */
  art = null,
  /** The picture's colour, as #rrggbb, when it should not follow `tone`. */
  hue = null,
  /** The old way: a glyph, shown in a tinted disc. Kept for anything outside
   *  the app that still passes one; `art` wins when both are given. */
  icon = null,
  /** What is empty. One short line - it is a heading, not a sentence. */
  title,
  /** What to do about it. One sentence, or nothing. */
  body = null,
  /** The way out - usually a <Button>, given its own px (className="px-6"):
   *  Button sets its height and never its width, and centred here without
   *  padding it shrink-wraps its label into a pill with no room at the ends. */
  action = null,
  tone = 'calm',
  /** `sm` for an empty state inside a card or section rather than a page. */
  size = 'md',
  className = '',
}) {
  const sm = size === 'sm'
  return (
    <div className={cx('text-center', sm ? 'px-6 py-8' : 'px-8 py-12', className)}>
      {art ? (
        /* In a flex row, not inline: an <img> on a line of its own sits on
           the text baseline and grows a gap under it, and the live picture
           is an inline-block that `mx-auto` would not centre. */
        <div className="flex justify-center">
          <EmptyArt name={art} hue={hue ?? (tone === 'good' ? GOOD_HUE : null)} size={sm ? 64 : 88} />
        </div>
      ) : icon && (
        <div
          className={cx(
            'mx-auto rounded-full flex items-center justify-center',
            sm ? 'w-11 h-11' : 'w-14 h-14',
            TONE[tone] ?? TONE.calm,
          )}
        >
          {icon}
        </div>
      )}

      <p
        className={cx(
          'font-semibold text-slate-800 dark:text-white',
          sm ? 'text-14' : 'text-15',
          art ? 'mt-2' : icon && 'mt-4',
        )}
      >
        {title}
      </p>

      {body && (
        /* Balanced, for the same reason the confirm sheet's subtitle is: this
           is one centred sentence, and greedy wrapping strands its last word
           on a line of its own often enough to be worth asking for. */
        <p className="mt-1.5 text-13 leading-relaxed text-balance text-slate-500 dark:text-slate-400">
          {body}
        </p>
      )}

      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

/**
 * An empty moment's picture on its own, for the few that are not laid out as
 * an EmptyState - a chart's placeholder, which has to hold the chart's
 * height, and the home screen's slot where the first account card goes. In
 * the accent unless given a hue, arriving once, still under reduced motion.
 *
 * A component of its own so that only an empty state WITH a picture reads the
 * theme and the motion setting.
 *
 * @param {{name: string, hue?: string|null, size?: number}} props
 */
export function EmptyArt({ name, hue = null, size = 88 }) {
  const { accentColor } = useTheme()
  const reduce = useReduceMotion()
  return <GlassArt name={name} hue={hue ?? accentColor} size={size} animate={!reduce} />
}
