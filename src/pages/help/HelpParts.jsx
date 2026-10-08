import { forwardRef } from 'react'
import Card from '../../components/ui/Card'
import Divider from '../../components/ui/Divider'
import HelpGlyph, { GlyphTile } from '../../components/help/HelpGlyph'
import { IconChevronRight } from '../../components/icons'
import { useTheme } from '../../context/ThemeContext'
import { HELP_TOPICS, WIDE_SHOTS, helpTopic, articlesIn } from '../../lib/help'
import { shotUrl } from './helpShots'
import { CONTACT_EMAIL } from '../../lib/contact'

/**
 * The pieces the help centre is built from, shared by the phone's pages
 * (pages/help) and the computer's (web/pages/WebHelp): the search box, the
 * topics, a list of questions, and an answer drawn from its blocks
 * (lib/help.js says what each block is).
 *
 * @typedef {import('../../lib/help').HelpArticle} HelpArticle
 */

/**
 * The search box: the subject of the help centre's first screen, so it is a
 * field at full size, not the 38px bar that narrows a list.
 *
 * @type {import('react').ForwardRefExoticComponent<{value: string, onChange: (v: string) => void, placeholder?: string, autoFocus?: boolean, className?: string, onKeyDown?: (e: import('react').KeyboardEvent<HTMLInputElement>) => void} & import('react').RefAttributes<HTMLInputElement>>}
 */
export const HelpSearchBox = forwardRef(function HelpSearchBox({ value, onChange, placeholder = 'Search for an answer', autoFocus = false, className = '', onKeyDown }, ref) {
  return (
    // White in both themes: it sits on the accent, where a dark field reads as a hole in it.
    <label className={`help-search flex items-center gap-3 h-12 px-4 rounded-full bg-white text-slate-900 shadow-[0_6px_24px_-8px_rgba(15,23,42,0.35)] ${className}`}>
      <span className="text-slate-400 shrink-0"><HelpGlyph name="search" size={18} /></span>
      <input
        ref={ref}
        type="search"
        enterKeyHint="search"
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Search help"
        className="flex-1 min-w-0 bg-transparent outline-none text-15 placeholder-slate-400 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="shrink-0 -mr-1 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 active:bg-slate-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </label>
  )
})

/**
 * Questions, one row each: the question, and the one-line answer under it.
 *
 * @param {{articles: HelpArticle[], onOpen: (a: HelpArticle) => void, showTopic?: boolean, className?: string}} props
 */
export function ArticleRows({ articles, onOpen, showTopic = false, className = '' }) {
  return (
    <Card radius="3xl" clip className={className}>
      {articles.map((a, i) => (
        <div key={a.id}>
          {i > 0 && <Divider inset="row" />}
          <button type="button" onClick={() => onOpen(a)} className="help-row w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50 dark:active:bg-white/[0.03] transition-colors">
            <span className="flex-1 min-w-0">
              {showTopic && <span className="block text-11 font-semibold accent-ink mb-0.5">{helpTopic(a.topic)?.title}</span>}
              <span className="block text-15 font-semibold leading-snug text-slate-900 dark:text-white">{a.title}</span>
              <span className="block mt-0.5 text-13 leading-snug text-slate-500 dark:text-slate-400 line-clamp-2">{a.summary}</span>
            </span>
            <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight size={18} /></span>
          </button>
        </div>
      ))}
    </Card>
  )
}

/**
 * The topics, as tiles.
 *
 * @param {{onOpen: (topicId: string) => void, className?: string}} props
 */
export function TopicGrid({ onOpen, className = '' }) {
  return (
    <div className={`help-topics grid grid-cols-2 gap-3 ${className}`}>
      {HELP_TOPICS.map(t => (
        <Card key={t.id} as="button" type="button" radius="3xl" interactive onClick={() => onOpen(t.id)} className="help-topic flex flex-col items-start gap-3 p-4">
          <GlyphTile name={t.icon} />
          <span className="min-w-0">
            <span className="block text-15 font-semibold leading-snug text-slate-900 dark:text-white">{t.title}</span>
            <span className="block mt-1 text-12 leading-snug text-slate-500 dark:text-slate-400">{articlesIn(t.id).length} answers</span>
          </span>
        </Card>
      ))}
    </div>
  )
}

/** Still stuck: the person who makes Spendr, by email. @param {{className?: string}} props */
export function ContactCard({ className = '' }) {
  return (
    <Card as="a" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Spendr help')}`} radius="3xl" interactive className={`help-contact flex items-center gap-3 px-4 py-4 ${className}`}>
      <GlyphTile name="mail" />
      <span className="flex-1 min-w-0">
        <span className="block text-15 font-semibold text-slate-900 dark:text-white">Still stuck?</span>
        <span className="block text-13 text-slate-500 dark:text-slate-400">Email the person who makes Spendr. Answers usually come within a day.</span>
      </span>
      <span className="text-slate-300 dark:text-slate-600 shrink-0"><IconChevronRight size={18} /></span>
    </Card>
  )
}

/**
 * An answer: its blocks, in order.
 *
 * `renderGo` draws the button that opens a place in the app, so each layout
 * can use its own button (the phone's full-width one, the desk's).
 *
 * @param {{article: HelpArticle, renderGo: (to: string, label: string) => import('react').ReactNode}} props
 */
export function HelpBody({ article, renderGo }) {
  const { theme } = useTheme()
  return (
    <div className="help-body flex flex-col gap-4">
      {article.body.map((b, i) => {
        if ('p' in b) {
          return <p key={i} className="text-15 leading-relaxed text-slate-700 dark:text-slate-300">{b.p}</p>
        }
        if ('steps' in b) {
          return (
            <ol key={i} className="flex flex-col gap-3">
              {b.steps.map((s, j) => (
                <li key={j} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 mt-px rounded-full flex items-center justify-center text-12 font-bold tabular-nums bg-primary/[0.10] dark:bg-primary/[0.18] accent-ink">{j + 1}</span>
                  <span className="text-15 leading-relaxed text-slate-700 dark:text-slate-300">{s}</span>
                </li>
              ))}
            </ol>
          )
        }
        if ('tip' in b) {
          return (
            <div key={i} className="help-tip flex items-start gap-3 rounded-2xl px-4 py-3.5 bg-primary/[0.06] dark:bg-primary/[0.10]">
              <span className="accent-ink shrink-0 mt-0.5"><HelpGlyph name="bulb" size={18} /></span>
              <p className="text-14 leading-relaxed text-slate-700 dark:text-slate-300">{b.tip}</p>
            </div>
          )
        }
        if ('shot' in b) {
          const url = shotUrl(b.shot, theme === 'dark' ? 'dark' : 'light')
          if (!url) return null
          const wide = WIDE_SHOTS.has(b.shot)
          return (
            <figure key={i} className={`help-shot ${wide ? 'is-wide' : 'is-phone'} my-1`}>
              <img
                src={url}
                alt={b.caption ?? `${article.title}, on screen`}
                loading="lazy"
                decoding="async"
                width={wide ? 1440 : 393}
                height={wide ? 900 : 852}
                className={wide
                  ? 'block w-full h-auto rounded-2xl ring-1 ring-slate-900/10 dark:ring-white/10'
                  : 'block mx-auto w-full max-w-[236px] h-auto rounded-[30px] ring-1 ring-slate-900/10 dark:ring-white/10 shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)]'}
              />
              {b.caption && <figcaption className="mt-2 text-center text-12 text-slate-500 dark:text-slate-400">{b.caption}</figcaption>}
            </figure>
          )
        }
        if ('go' in b) {
          return <div key={i} className="help-go">{renderGo(b.go, b.label)}</div>
        }
        return null
      })}
    </div>
  )
}

/** Nothing found: say so, and what to try. @param {{query: string}} props */
export function NoResults({ query }) {
  return (
    <div className="help-none px-6 py-10 text-center">
      <p className="text-15 font-semibold text-slate-800 dark:text-slate-100">No answers for “{query.trim()}”</p>
      <p className="mt-1 text-13 text-slate-500 dark:text-slate-400 text-balance">Try fewer words, or the name of the screen you’re on, like Budget or Accounts.</p>
    </div>
  )
}
