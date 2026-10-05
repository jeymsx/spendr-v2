import { useNavigate } from 'react-router-dom'
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from '../../lib/policy'
import { Segmented } from '../ui/controls'

/**
 * The privacy policy and the terms on a computer: one row in Settings'
 * column, Privacy & terms, and a page in its right half with a switch
 * between the two - rather than the phone's sheet over the page
 * (settings/Policy).
 *
 * The words are lib/policy.js, as the phone's and the website's are, so the
 * three can never tell different stories: its untitled first entry is the
 * line under the title (when it was last updated), and each titled one a
 * numbered section. An email address in Contact is a link.
 *
 * @param {{type: 'privacy'|'terms'}} props
 */
export default function WebSettingsPolicy({ type }) {
  const navigate = useNavigate()
  const sections = type === 'privacy' ? PRIVACY_SECTIONS : TERMS_SECTIONS
  const intro = sections.find(s => s.h === null)
  const body = sections.filter(s => s.h !== null)
  return (
    <div className="pb-2">
      <header className="d-pane-head flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="d-pane-title">{type === 'privacy' ? 'Privacy policy' : 'Terms of use'}</h2>
          {intro && <p className="d-pane-sub">{intro.b}</p>}
        </div>
        <Segmented
          label="Show"
          className="shrink-0"
          value={type}
          onChange={(v) => navigate(`/settings/${v}`, { replace: true })}
          options={[{ value: 'privacy', label: 'Privacy' }, { value: 'terms', label: 'Terms' }]}
        />
      </header>
      <div className="mx-5 d-panel px-6 py-2">
        {body.map((s, i) => (
          <section key={s.h} className="d-policy-section">
            <span className="d-policy-num d-num" aria-hidden="true">{i + 1}</span>
            <div className="min-w-0">
              <h3 className="d-policy-head">{s.h}</h3>
              <p className="d-policy-body">{withEmailLink(s.b)}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

/** A section's text, its email address (if it has one) a mail link. @param {string} text */
function withEmailLink(text) {
  const m = text.match(/[\w.-]+@[\w.-]+\.\w+/)
  if (!m || m.index == null) return text
  return (
    <>
      {text.slice(0, m.index)}
      <a href={`mailto:${m[0]}`} className="d-link">{m[0]}</a>
      {text.slice(m.index + m[0].length)}
    </>
  )
}
