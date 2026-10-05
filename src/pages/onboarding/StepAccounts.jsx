import { forwardRef, useState } from 'react'
import { PH_ACCOUNTS, PH_GROUPS, POPULAR_ACCOUNTS } from '../../lib/phAccounts'
import { IconTick } from '../../components/icons'
import { PreviewCard } from '../../components/CardStyle'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import SectionLabel from '../../components/ui/SectionLabel'
import SearchField from '../../components/ui/SearchField'
import { CUSTOM_TYPES } from './shared'
import { Heading, Overlay, StepBody, StepFooter } from './parts'

/**
 * Which accounts do you use?
 *
 * The six most people here have are real card faces - the ones Accounts
 * will show - so picking GCash looks like getting the GCash card, and it
 * joins the hand of cards on the stage above. Every other bank and wallet is
 * a tap away under "More", and anything not listed is "Add your own".
 */

export const COLOR_SWATCHES = ['#2D9DFF', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#ec4899']

/**
 * @typedef {{name: string, type: string, color: string}} Acct
 */

/**
 * @param {{selectedNames: Set<string>, onToggle: (name: string) => void, customAccounts: Acct[],
 *          onAddCustom: (a: Acct) => void, onRemoveCustom: (name: string) => void, onNext: () => void}} props
 */
export const StepAccounts = forwardRef(
  /** @param {any} props @param {import('react').Ref<HTMLHeadingElement>} ref */
  function StepAccounts({ selectedNames, onToggle, customAccounts, onAddCustom, onRemoveCustom, onNext, currency = 'PHP' }, ref) {
    const [more, setMore] = useState(false)
    const [query, setQuery] = useState('')
    const [adding, setAdding] = useState(false)

    const q = query.toLowerCase().trim()
    const popular = new Set(POPULAR_ACCOUNTS.map(a => a.name))
    const rest = PH_ACCOUNTS.filter(a => !popular.has(a.name))
    const found = q ? PH_ACCOUNTS.filter(a => a.name.toLowerCase().includes(q)) : null
    const count = 1 + selectedNames.size + customAccounts.length

    return (
      <>
        <StepBody>
          <Heading ref={ref} title="Where do you keep your money?" sub="Pick all that apply. Cash is already in." />

          <div className="grid grid-cols-2 gap-3">
            {POPULAR_ACCOUNTS.map(acct => {
              const on = selectedNames.has(acct.name)
              return (
                <button
                  key={acct.name}
                  type="button"
                  aria-pressed={on}
                  aria-label={acct.name}
                  onClick={() => onToggle(acct.name)}
                  className={`press relative rounded-2xl transition-shadow duration-300 ${on
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-navy'
                    : ''}`}
                >
                  {/* In the currency setup keeps it in: a yen profile's GCash said PHP. */}
                  <PreviewCard draft={{ ...acct, currency }} />
                  <span
                    className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center
                      bg-primary text-on-primary shadow-md transition-[opacity,scale] duration-300 ${on ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
                    aria-hidden="true"
                  >
                    <IconTick size={12} />
                  </span>
                </button>
              )
            })}
          </div>

          {!more ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setMore(true)}>More banks and wallets</Button>
              <Button variant="quiet" onClick={() => setAdding(true)}>Add your own</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <SearchField
                tone="onDark"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onClear={() => setQuery('')}
                placeholder="Search banks and wallets"
              />
              {found ? (
                found.length ? <Chips list={found} selected={selectedNames} onToggle={onToggle} /> : (
                  <p className="text-14 text-slate-400">
                    Nothing called “{query}”. <button type="button" className="text-primary font-semibold" onClick={() => setAdding(true)}>Add it yourself</button>
                  </p>
                )
              ) : (
                PH_GROUPS.map(group => {
                  const list = rest.filter(a => a.group === group)
                  return list.length ? (
                    <div key={group}>
                      <SectionLabel>{group}</SectionLabel>
                      <Chips list={list} selected={selectedNames} onToggle={onToggle} />
                    </div>
                  ) : null
                })
              )}
              {!found && (
                <Button variant="quiet" onClick={() => setAdding(true)} className="self-start">Add your own</Button>
              )}
            </div>
          )}

          {customAccounts.length > 0 && (
            <div>
              <SectionLabel>Your own</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {customAccounts.map(a => (
                  <span key={a.name} data-on="" className="onb-choice flex items-center gap-2 rounded-full pl-3.5 pr-1.5 py-1.5 text-14 font-medium text-white">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                    {a.name}
                    <button
                      type="button"
                      onClick={() => onRemoveCustom(a.name)}
                      aria-label={`Remove ${a.name}`}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white/70 active:bg-white/10"
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M2 2l6 6M8 2L2 8" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </StepBody>

        <StepFooter>
          <Button size="lg" block onClick={onNext}>
            Continue with {count} {count === 1 ? 'account' : 'accounts'}
          </Button>
        </StepFooter>

        <Overlay>
          <CustomAccountSheet
            open={adding}
            initialName={found && !found.length ? query.trim() : ''}
            onClose={() => setAdding(false)}
            onAdd={a => { onAddCustom(a); setAdding(false); setQuery('') }}
            taken={[...PH_ACCOUNTS.map(x => x.name), ...customAccounts.map(x => x.name), 'Cash']}
          />
        </Overlay>
      </>
    )
  },
)

/** @param {{list: Acct[], selected: Set<string>, onToggle: (name: string) => void}} props */
function Chips({ list, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {list.map(a => {
        const on = selected.has(a.name)
        return (
          <button
            key={a.name}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(a.name)}
            className="onb-choice press flex items-center gap-2 rounded-full px-3.5 py-2 text-14 font-medium text-white"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
            {a.name}
            {on && <span className="text-primary" aria-hidden="true"><IconTick size={12} /></span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Anything the lists do not have: a name, what kind it is, and a colour.
 *
 * @param {{open: boolean, initialName: string, onClose: () => void, onAdd: (a: Acct) => void, taken: string[]}} props
 */
function CustomAccountSheet({ open, initialName, onClose, onAdd, taken }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('bank')
  const [color, setColor] = useState(COLOR_SWATCHES[0])
  const [wasOpen, setWasOpen] = useState(false)
  /* Fresh each time it opens, with whatever was just searched for. */
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setName(initialName); setType('bank'); setColor(COLOR_SWATCHES[0]) }
  }
  const trimmed = name.trim()
  const clash = taken.some(t => t.toLowerCase() === trimmed.toLowerCase())

  return (
    <Sheet open={open} onClose={onClose} title="Add your own" z={120}>
      <div className="flex flex-col gap-4 pb-1">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && trimmed && !clash) onAdd({ name: trimmed, type, color }) }}
          placeholder="Account name"
          aria-label="Account name"
          maxLength={40}
          className="w-full rounded-2xl px-4 py-3.5 text-15 text-white placeholder:text-slate-500
            bg-white/[0.06] border border-white/[0.12] outline-none focus:border-primary/70 transition-colors"
        />
        {clash && <p className="-mt-2 text-13 text-amber-400">You already have one called that.</p>}
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Kind of account">
          {CUSTOM_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => setType(t.value)}
              className="onb-choice press rounded-xl py-2.5 text-13 font-semibold text-white"
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3" role="radiogroup" aria-label="Colour">
          {COLOR_SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${c}`}
              onClick={() => setColor(c)}
              className={`press w-8 h-8 rounded-full shrink-0 transition-shadow ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-panel' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <Button size="lg" block disabled={!trimmed || clash} onClick={() => onAdd({ name: trimmed, type, color })}>
          Add account
        </Button>
      </div>
    </Sheet>
  )
}
