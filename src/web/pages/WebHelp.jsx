import { useMemo, useRef } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Page from '../ui/Page'
import Panel from '../ui/Panel'
import Btn from '../ui/Button'
import { SearchInput } from '../ui/controls'
import { IChevronRight } from '../ui/icons'
import { GlyphTile } from '../../components/help/HelpGlyph'
import HelpGlyph from '../../components/help/HelpGlyph'
import { HELP_POPULAR, HELP_QUICK, HELP_TOPICS, articlesIn, helpArticle, helpTopic } from '../../lib/help'
import { searchHelp } from '../../lib/helpSearch'
import { CONTACT_EMAIL } from '../../lib/contact'
import { HelpBody, HelpSearchBox } from '../../pages/help/HelpParts'
import FeedbackDialog from '../ui/FeedbackDialog'
import { useFeedback } from '../../components/feedback/useFeedback'

/**
 * The help centre on a computer (lib/help.js; the phone's is pages/help).
 *
 * The front page is a help centre's: the question in the middle, the search
 * under it, a few answers to press without typing, then the topics and the
 * questions asked most. A topic and an answer sit beside the list of topics,
 * the open one unfolded to its questions, so the next question is one click
 * from the answer to the last.
 *
 *   /help                    search and topics
 *   /help/topic/:topicId     a topic's questions
 *   /help/:articleId         an answer - the address the website gives it too
 */

/** @typedef {import('../../lib/help').HelpArticle} HelpArticle */

const present = (/** @type {Array<HelpArticle|null>} */ list) => /** @type {HelpArticle[]} */ (list.filter(Boolean))

export default function WebHelp() {
  const parts = useLocation().pathname.split('/').filter(Boolean)
  if (parts[1] === 'topic') return <HelpShelf topicId={parts[2] ?? ''} />
  if (parts[1]) return <HelpShelf articleId={parts[1]} />
  return <HelpHub />
}

function HelpHub() {
  const navigate = useNavigate()
  // Still stuck: a message from the app when it can send one, an email when it cannot (lib/feedback.js).
  const f = useFeedback()
  const contact = () => { if (f.canSend) f.show('other'); else window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Spendr help')}` }
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const results = useMemo(() => (q.trim().length >= 2 ? searchHelp(q) : null), [q])
  const open = (/** @type {HelpArticle} */ a) => navigate(`/help/${a.id}`)

  return (
    <Page width={1080}>
      <section className="d-help-hero">
        <h1 className="d-help-hero-title">How can we help?</h1>
        <p className="d-help-hero-sub">Answers to everything Spendr does, on your phone and here.</p>
        <HelpSearchBox
          className="d-help-hero-search"
          value={q}
          autoFocus={!!q}
          onChange={v => setParams(v ? { q: v } : {}, { replace: true })}
          onKeyDown={e => { if (e.key === 'Enter' && results?.[0]) open(results[0]) }}
          placeholder="Search, like “add a bill” or “recently deleted”"
        />
        {!results && (
          <p className="d-help-quick">
            <span>Quick help:</span>
            {present(HELP_QUICK.map(helpArticle)).map(a => <Link key={a.id} to={`/help/${a.id}`}>{a.title}</Link>)}
          </p>
        )}
      </section>

      {results ? (
        <Panel className="mt-8" title={results.length ? `${results.length === 1 ? 'One answer' : `${results.length} answers`} for “${q.trim()}”` : `No answers for “${q.trim()}”`} flush>
          {results.length
            ? <Rows articles={results} showTopic />
            : <p className="px-6 pb-6 text-13 text-[var(--d-text-3)]">Try fewer words, or the name of the page you’re on, like Budget or Accounts. Or <button type="button" className="d-link" onClick={contact}>{f.canSend ? 'send us a message' : 'email us'}</button>.</p>}
        </Panel>
      ) : (
        <>
          <h2 className="d-help-h2">Topics</h2>
          <div className="d-help-topics">
            {HELP_TOPICS.map(t => (
              <Link key={t.id} to={`/help/topic/${t.id}`} className="d-help-topic">
                <GlyphTile name={t.icon} />
                <span className="d-help-topic-title">{t.title}</span>
                <span className="d-help-topic-blurb">{t.blurb}</span>
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-5 mt-8">
            <Panel className="col-span-8" title="Asked most" flush>
              <Rows articles={present(HELP_POPULAR.map(helpArticle))} />
            </Panel>
            <Panel className="col-span-4 self-start" title="Still stuck?">
              <p className="text-13 leading-relaxed text-[var(--d-text-2)]">{f.canSend ? 'Send a message to' : 'Email'} the person who makes Spendr. Answers usually come within a day.</p>
              <Btn className="mt-4" icon={<HelpGlyph name="mail" size={15} />} onClick={contact}>
                {f.canSend ? 'Send a message' : 'Email us'}
              </Btn>
            </Panel>
          </div>
        </>
      )}
      <FeedbackDialog f={f} />
    </Page>
  )
}

/**
 * A topic, or an answer, beside the topics.
 *
 * @param {{topicId?: string, articleId?: string}} props
 */
function HelpShelf({ topicId, articleId }) {
  const navigate = useNavigate()
  const search = useRef(/** @type {HTMLInputElement|null} */ (null))
  const f = useFeedback()
  const article = articleId ? helpArticle(articleId) : null
  const topic = helpTopic(article?.topic ?? topicId ?? '')
  if (!topic || (articleId && !article)) return <Navigate to="/help" replace />
  const related = present((article?.related ?? []).map(helpArticle))

  return (
    <Page width={1180} scrollKey={article?.id ?? topic.id}>
      <nav className="d-help-crumbs" aria-label="Breadcrumb">
        <Link to="/help">Help</Link>
        <IChevronRight size={12} />
        {article ? <Link to={`/help/topic/${topic.id}`}>{topic.title}</Link> : <span aria-current="page">{topic.title}</span>}
      </nav>
      <div className="d-help-shelf">
        <aside className="d-help-side">
          {/* Typing here takes you to the front page's search, already filled in. */}
          <SearchInput
            ref={search}
            value=""
            onChange={v => { if (v) navigate(`/help?q=${encodeURIComponent(v)}`) }}
            placeholder="Search help"
            label="Search help"
          />
          <nav className="d-help-nav" aria-label="Help topics">
            {HELP_TOPICS.map(t => (
              <div key={t.id}>
                <Link to={`/help/topic/${t.id}`} className={`d-help-nav-topic${t.id === topic.id ? ' is-open' : ''}`} aria-current={!article && t.id === topic.id ? 'page' : undefined}>
                  {t.title}
                </Link>
                {t.id === topic.id && (
                  <ul className="d-help-nav-list">
                    {articlesIn(t.id).map(a => (
                      <li key={a.id}>
                        <Link to={`/help/${a.id}`} className={`d-help-nav-item${a.id === article?.id ? ' is-on' : ''}`} aria-current={a.id === article?.id ? 'page' : undefined}>
                          {a.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          {article ? (
            <>
              <Panel className="d-help-article">
                <h1 className="d-help-article-title">{article.title}</h1>
                <p className="d-help-article-lead">{article.summary}</p>
                <div className="d-help-article-body">
                  <HelpBody
                    article={article}
                    renderGo={(to, label) => <Btn variant="primary" onClick={() => navigate(to)}>{label}</Btn>}
                  />
                </div>
              </Panel>
              {related.length > 0 && (
                <Panel className="mt-5" title="Related questions" flush>
                  <Rows articles={related} />
                </Panel>
              )}
            </>
          ) : (
            <Panel flush>
              <div className="d-help-topic-head">
                <GlyphTile name={topic.icon} size="lg" />
                <div className="min-w-0">
                  <h1 className="d-help-topic-head-title">{topic.title}</h1>
                  <p className="d-help-topic-head-blurb">{topic.blurb}</p>
                </div>
              </div>
              <Rows articles={articlesIn(topic.id)} />
            </Panel>
          )}
          <p className="d-help-foot">
            Still stuck? {f.canSend
              ? <button type="button" className="d-link" onClick={() => f.show('other')}>Send a message to the person who makes Spendr</button>
              : <a className="d-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Spendr help')}`}>Email the person who makes Spendr</a>}.
          </p>
        </div>
      </div>
      <FeedbackDialog f={f} />
    </Page>
  )
}

/** @param {{articles: HelpArticle[], showTopic?: boolean}} props */
function Rows({ articles, showTopic = false }) {
  return (
    <ul className="d-help-rows">
      {articles.map(a => (
        <li key={a.id}>
          <Link to={`/help/${a.id}`} className="d-help-row">
            <span className="min-w-0 flex-1">
              {showTopic && <span className="d-help-row-topic">{helpTopic(a.topic)?.title}</span>}
              <span className="d-help-row-title">{a.title}</span>
              <span className="d-help-row-summary">{a.summary}</span>
            </span>
            <IChevronRight size={16} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
