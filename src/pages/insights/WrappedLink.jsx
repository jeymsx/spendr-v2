import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'
import { wrappedTitle } from '../../lib/recapCopy'
import { IconChevronRight } from '../../components/icons'
import { artUrl } from '../recap/assets'
import { recapPalette } from '../recap/theme'

/**
 * The way into a month's Wrapped from Insights: one slim row at the foot of
 * the page.
 *
 * It was the full Wrapped card - gift, stickers, confetti, two buttons - in
 * the middle of the analysis, between the categories and net worth, where it
 * interrupted a page that is about reading figures. The story is a different
 * way of looking at the month, so it closes the page instead, still in the
 * story's own colours so it reads as the way in. Sharing its picture lives on
 * the story's last slide.
 *
 * Plain, on purpose: none of the story's animation code comes with it, only
 * its palette and one still picture of the gift.
 *
 * @param {{month: string}} props  "2026-08" - a finished month with something in it
 */
export default function WrappedLink({ month }) {
  const { accentColor, theme } = useTheme()
  const pal = useMemo(() => recapPalette(accentColor, theme === 'dark' ? 'dark' : 'light'), [accentColor, theme])
  const title = wrappedTitle(month)
  return (
    <div className="px-5">
      <Link
        to={`/recap/${month}`}
        className="press relative isolate overflow-hidden rounded-2xl flex items-center gap-3 pl-2 pr-4 h-16"
        style={{ background: pal.tones[0].background }}
      >
        <span className="recap-texture" aria-hidden="true" />
        <img src={artUrl('wrapped-gift', pal.accent)} alt="" width={48} height={48} className="relative shrink-0 -rotate-6" draggable={false} />
        <span className="relative min-w-0 flex-1 flex flex-col">
          <span className="text-15 font-semibold truncate" style={{ color: pal.ink }}>{title}</span>
          <span className="text-12 truncate" style={{ color: pal.muted }}>Watch your month as a story</span>
        </span>
        <span className="relative shrink-0" style={{ color: pal.ink }} aria-hidden="true"><IconChevronRight size={16} strokeWidth="2.2" /></span>
      </Link>
    </div>
  )
}
