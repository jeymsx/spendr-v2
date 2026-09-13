import { useState } from 'react'
import { EMOJI_SUGGESTIONS, CAT_PALETTE } from '../../lib/phCategories'
import CategoryGlyph from '../../components/CategoryGlyph'
import Confetti from '../../components/Confetti'
import Button from '../../components/ui/Button'
import SectionLabel from '../../components/ui/SectionLabel'
import { IconSparkle, IconTick } from '../../components/icons'

// ── Step 5 & 6: Pick categories ────────────────────────────────────────────────

export const CAT_SWATCHES = CAT_PALETTE.slice(0, 7)

export function StepPickCategories({ type, stepNum, locked, presets, selectedNames, onToggle, customCats, onAddCustom, onRemoveCustom, onNext }) {
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName,     setCustomName]     = useState('')
  const [customIcon,     setCustomIcon]     = useState(EMOJI_SUGGESTIONS[0])
  const [customColor,    setCustomColor]    = useState(CAT_SWATCHES[0])

  const isExpense    = type === 'expense'
  const totalSelected = 1 + selectedNames.size + customCats.length

  function openCustomForm() {
    setCustomName(''); setCustomIcon(EMOJI_SUGGESTIONS[0]); setCustomColor(CAT_SWATCHES[0])
    setShowCustomForm(true)
  }

  function addCustom() {
    const trimmed = customName.trim()
    if (!trimmed) return
    onAddCustom({ name: trimmed, icon: customIcon, color: customColor, type })
    setCustomName(''); setCustomIcon(EMOJI_SUGGESTIONS[0]); setCustomColor(CAT_SWATCHES[0])
    setShowCustomForm(false)
  }

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      <div className="shrink-0">
        <p className="text-primary text-xs font-bold mb-3">Step {stepNum} of 6</p>
        <h2 className="text-28 font-semibold leading-tight text-white">
          {isExpense ? <>What do you<br />spend on?</> : <>What are your<br />income sources?</>}
        </h2>
        <p className="text-slate-500 mt-2 text-sm">
          Tap to select. &ldquo;{locked.name}&rdquo; is always included.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-5 pb-2">
        {/* Locked chip */}
        <div>
          <SectionLabel>Always included</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
              bg-white/[0.08] border border-white/[0.15] text-slate-300 text-sm font-semibold">
              <CategoryGlyph cat={locked} size={13} /> {locked.name}
              <span className="opacity-70 ml-0.5"><IconTick size={11} /></span>
            </span>
          </div>
        </div>

        {/* Preset chips */}
        <div>
          <SectionLabel>Suggestions</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {presets.map(cat => {
              const sel = selectedNames.has(cat.name)
              return (
                <button
                  key={cat.name}
                  onClick={() => onToggle(cat.name)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium
                    transition-all duration-100 active:scale-95 ${
                    sel
                      ? 'bg-primary/15 border-primary/50 text-primary'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 active:bg-white/[0.08]'
                  }`}
                >
                  <CategoryGlyph cat={cat} size={13} />
                  {cat.name}
                  {sel && <span className="ml-0.5"><IconTick size={11} /></span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom categories */}
        {customCats.length > 0 && (
          <div>
            <SectionLabel>Custom</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {customCats.map(cat => (
                <span key={cat.name}
                  className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl
                    bg-primary/15 border border-primary/50 text-primary text-sm font-medium">
                  <CategoryGlyph cat={cat} size={13} />
                  {cat.name}
                  <button
                    onClick={() => onRemoveCustom(cat.name)}
                    className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center
                      text-primary/60 hover:text-primary hover:bg-primary/20 transition-colors shrink-0"
                    aria-label={`Remove ${cat.name}`}
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={openCustomForm}
          className="flex items-center gap-2 text-sm text-slate-500 active:text-slate-300
            transition-colors active:scale-95 duration-100"
        >
          <span className="w-6 h-6 rounded-full border border-white/[0.12] flex items-center justify-center text-xs">+</span>
          Add custom category
        </button>
      </div>

      {/* Custom category modal */}
      {showCustomForm && (
        /* design-ok: not a Sheet, and it cannot be one. Sheet's panel is
            `bg-panel`, which is theme-aware - and this screen is drawn in the
            dark palette whatever the theme setting (28 unconditional
            `text-white`, not one `dark:` variant), so a Sheet here would be a
            white panel on a dark screen in light mode. It also runs before the
            app shell exists, where Sheet's scroll lock and stacking order have
            nothing to sit in. Centred, and dismissed by the backdrop. */
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          role="dialog"
          aria-modal="true"
          aria-label="Custom category"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCustomForm(false)}
          />
          <div className="relative w-full max-w-sm bg-dark-lifted border border-white/[0.12] rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Custom category</h3>

            <input
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()}
              placeholder="Category name"
              autoFocus
              maxLength={30}
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3
                text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-primary/60
                transition-colors"
            />

            {/* Emoji picker */}
            <div>
              <SectionLabel>Icon</SectionLabel>
              <div className="grid grid-cols-8 gap-1 max-h-[108px] overflow-y-auto">
                {EMOJI_SUGGESTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => setCustomIcon(e)}
                    className={`h-9 rounded-xl flex items-center justify-center text-18
                      active:scale-90 transition-all duration-75 ${
                      customIcon === e
                        ? 'bg-primary/20 ring-2 ring-primary/40'
                        : 'hover:bg-white/[0.06]'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Color swatches */}
            <div>
              <SectionLabel>Color</SectionLabel>
              <div className="flex gap-2.5">
                {CAT_SWATCHES.map(c => (
                  <button
                    key={c}
                    onClick={() => setCustomColor(c)}
                    className="relative w-7 h-7 rounded-full transition-transform duration-100 active:scale-90 shrink-0"
                    style={{ backgroundColor: c }}
                  >
                    {customColor === c && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-2.5 h-2.5 rounded-full bg-white/90 shadow-sm" />
                      </span>
                    )}
                    {customColor === c && (
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{ boxShadow: `0 0 0 2px ${c}, 0 0 0 4px ${c}88` }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCustomForm(false)}
                className="flex-1 py-3 rounded-full text-sm font-semibold text-slate-400
                  border border-white/[0.08] active:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
              <Button
                size="sm"
                className="flex-[2]"
                onClick={addCustom} disabled={!customName.trim()}
              >
                Add category
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 pt-2">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-16
             active:scale-[0.98] transition-all duration-100"
        >
          Continue ({totalSelected} {totalSelected === 1 ? 'category' : 'categories'}) →
        </button>
      </div>
    </div>
  )
}

// ── Step 7: Done / celebration ─────────────────────────────────────────────────

export function StepDone({ onFinish, saving }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 relative overflow-hidden text-center px-2">
      {/* Lives in components/Confetti.jsx now - the account-created screen
          shows the same burst, and two of these would drift. `rotation` and
          `spin` went with the move: both were computed per particle and
          neither was ever read, because the keyframe hardcodes its own
          720deg. */}
      <Confetti />

      <div style={{ animation: 'pageFadeIn 0.5s ease both' }}>
        {/* Stars, not a party popper. Untitled UI has no confetti, and a
            gift box would have read as the Gifts category. */}
        <div className="mb-6 flex justify-center text-primary"><IconSparkle size={64} /></div>
        <h2 className="text-32 font-bold text-white leading-tight">You're all set!</h2>
        <p className="text-slate-400 mt-3 text-15 leading-relaxed">
          Welcome to Spendr.<br />Time to take control of your money.
        </p>
      </div>

      <Button size="lg" block onClick={onFinish} disabled={saving}>
        {saving
          ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : 'Get started →'}
      </Button>
    </div>
  )
}
