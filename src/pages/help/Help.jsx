import { useMemo } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import SubPage from '../../components/SubPage'
import SectionHeading from '../../components/ui/SectionHeading'
import Button from '../../components/ui/Button'
import { GlyphTile } from '../../components/help/HelpGlyph'
import { HELP_POPULAR, HELP_QUICK, articlesIn, helpArticle, helpTopic } from '../../lib/help'
import { searchHelp } from '../../lib/helpSearch'
import { ArticleRows, ContactCard, HelpBody, HelpSearchBox, NoResults, TopicGrid } from './HelpParts'

/**
 * The help centre on the phone: every question about Spendr and its answer
 * (lib/help.js - the same articles the website publishes at /help).
 *
 *   /help                    search, the topics, the questions asked most
 *   /help/topic/:topicId     a topic's questions
 *   /help/:articleId         an answer
 *
 * The search is in the address (`?q=`), so Back from an answer it found comes
 * back to the same results rather than to an empty box.
 */

/** @typedef {import('../../lib/help').HelpArticle} HelpArticle */

const present = (/** @type {Array<HelpArticle|null>} */ list) => /** @type {HelpArticle[]} */ (list.filter(Boolean))

export default function HelpHome() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const results = useMemo(() => (q.trim().length >= 2 ? searchHelp(q) : null), [q])
  const open = (/** @type {HelpArticle} */ a) => navigate(`/help/${a.id}`)
  const setQuery = (/** @type {string} */ v) => setParams(v ? { q: v } : {}, { replace: true })

  return (
    <SubPage title="Help">
      <section className="px-5">
        {/* The accent, solid: the one screen whose whole job is the question
            in the middle of it, as a help centre's front page is. */}
        <div className="help-hero rounded-[28px] bg-primary text-on-primary px-5 pt-6 pb-5">
          <h2 className="text-28 leading-9 font-bold tracking-tight">How can we help?</h2>
          <p className="mt-1 text-sm opacity-80">Answers to everything Spendr does.</p>
          <HelpSearchBox className="mt-4" value={q} onChange={setQuery} placeholder="Search, like “add a bill”" />
          {!results && (
            <div className="mt-3 flex flex-wrap gap-2">
              {present(HELP_QUICK.map(helpArticle)).map(a => (
                <button key={a.id} type="button" onClick={() => open(a)}
                  className="press px-3 py-1.5 rounded-full text-13 font-semibold bg-white/[0.18] text-on-primary">
                  {a.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {results ? (
        <section className="px-5 mt-6" aria-live="polite">
          {results.length
            ? <ArticleRows articles={results} onOpen={open} showTopic />
            : <NoResults query={q} />}
          <ContactCard className="mt-6" />
        </section>
      ) : (
        <>
          <section className="px-5 mt-8">
            <SectionHeading inset="none" gap="none">Topics</SectionHeading>
            <TopicGrid className="mt-3" onOpen={id => navigate(`/help/topic/${id}`)} />
          </section>
          <section className="px-5 mt-8">
            <SectionHeading inset="none" gap="none">Asked most</SectionHeading>
            <ArticleRows className="mt-3" articles={present(HELP_POPULAR.map(helpArticle))} onOpen={open} />
          </section>
          <section className="px-5 mt-8">
            <ContactCard />
          </section>
        </>
      )}
    </SubPage>
  )
}

export function HelpTopicPage() {
  const { topicId = '' } = useParams()
  const navigate = useNavigate()
  const topic = helpTopic(topicId)
  if (!topic) return <Navigate to="/help" replace />
  return (
    <SubPage title={topic.title}>
      <section className="px-5">
        <div className="flex items-center gap-3">
          <GlyphTile name={topic.icon} size="lg" />
          <p className="text-sm leading-snug text-slate-500 dark:text-slate-400">{topic.blurb}</p>
        </div>
        <ArticleRows className="mt-5" articles={articlesIn(topic.id)} onOpen={a => navigate(`/help/${a.id}`)} />
        <ContactCard className="mt-8" />
      </section>
    </SubPage>
  )
}

export function HelpArticlePage() {
  const { articleId = '' } = useParams()
  const navigate = useNavigate()
  const article = helpArticle(articleId)
  if (!article) return <Navigate to="/help" replace />
  const topic = helpTopic(article.topic)
  const related = present((article.related ?? []).map(helpArticle))
  return (
    <SubPage title={topic?.title ?? 'Help'}>
      <article className="px-5">
        <h1 className="text-22 leading-7 font-bold tracking-tight text-slate-900 dark:text-white">{article.title}</h1>
        <p className="mt-2 text-15 leading-relaxed text-slate-500 dark:text-slate-400">{article.summary}</p>
        <div className="mt-6">
          <HelpBody
            article={article}
            renderGo={(to, label) => <Button block onClick={() => navigate(to)}>{label}</Button>}
          />
        </div>
      </article>
      {related.length > 0 && (
        <section className="px-5 mt-10">
          <SectionHeading inset="none" gap="none">Related questions</SectionHeading>
          <ArticleRows className="mt-3" articles={related} onOpen={a => navigate(`/help/${a.id}`)} />
        </section>
      )}
      <section className="px-5 mt-8">
        <ContactCard />
      </section>
    </SubPage>
  )
}

