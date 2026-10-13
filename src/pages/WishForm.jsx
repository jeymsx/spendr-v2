import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import DateInput from '../components/ui/DateInput'
import { useBack } from '../hooks/useBack'
import { useLeaveGuard } from '../hooks/useBackGuard'
import DiscardSheet from '../components/DiscardSheet'
import db from '../db/db'
import { useLiveQuery } from '../hooks/useLiveQuery'
import { useToast } from '../context/ToastContext'
import { useBaseCurrency } from '../context/CurrencyContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../utils/moneyInput'
import { fieldFrame } from '../components/ui/Field'
import { IconCalendar, IconChevronLeft } from '../components/icons'
import Button from '../components/ui/Button'
import IconButton from '../components/ui/IconButton'
import PinnedTop from '../components/ui/PinnedTop'
import SectionLabel from '../components/ui/SectionLabel'
import AmountInput from '../components/ui/AmountInput'
import { baseDecimals, zeroAmount, fmt } from '../lib/money'
import { coolDaysFor, coolUntilFrom, dayKey, readShared, cleanLink } from '../lib/wishes'
import { addWish, updateWish } from '../db/wishes'
import { FormActions } from './wishlist/WishActions'
import { useWishActions } from './wishlist/useWishActions'
import { fmtDay, decidedWords } from './wishlist/shared'

/**
 * A wish, new or changed - laid out as Add expense is, because it is the same
 * kind of moment: a price, big, then what it is.
 *
 *   Price             the hero, typed first
 *   What do you want  its name
 *   Link              where it is sold; paste a shop's whole share text and
 *                     the name and price come with it (lib/wishes.js readShared)
 *   Ask me again on   a day: set by the price until you pick one
 *                     (coolDaysFor), and yours to change any time
 *
 * Opened on a wish (/wishlist/:id, from Edit on its details), the same page
 * edits it, and below Save are putting a decided one back on the list, and
 * Delete. Those leave the page: they are about whether the wish is still
 * waiting, not what it says.
 */
export default function WishForm() {
  const { id } = useParams()
  const isEdit = id != null && id !== 'new'
  const back = useBack('/wishlist')
  const { showToast } = useToast()
  const base = useBaseCurrency()

  /* The wish being edited; undefined while it loads, null when there is none. */
  const wish = useLiveQuery(
    async () => (isEdit ? (await db.wishes.get(Number(id))) ?? null : null),
    [id], undefined,
  )

  const [price, setPrice] = useState('0')
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  /** The day the wait ends, 'YYYY-MM-DD'. */
  const [until, setUntil] = useState(() => coolUntilFrom(1))
  /** Picked by hand: the price no longer sets it. */
  const [chosen, setChosen] = useState(false)
  /** A name the link gave, so the next link may replace it but a typed one is kept. */
  const [linkName, setLinkName] = useState('')
  const [saving, setSaving] = useState(false)

  // Filled once from the wish being edited.
  const hydrated = useRef(false)
  useEffect(() => {
    if (!isEdit || hydrated.current || !wish) return
    hydrated.current = true
    setPrice(numToMoneyStr(wish.price ?? 0))
    setName(wish.name ?? '')
    setLink(wish.link ?? '')
    setUntil(wish.coolUntil ?? coolUntilFrom(7))
    setChosen(true)
  }, [isEdit, wish])

  const priceRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  useEffect(() => {
    if (isEdit) return
    const t = setTimeout(() => priceRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [isEdit])

  const priceNum = parseMoney(price)
  const decided = isEdit && !!wish && (wish.status ?? 'waiting') !== 'waiting'

  /** @param {string} v */
  function takePrice(v) {
    setPrice(v)
    if (!chosen && !isEdit) setUntil(coolUntilFrom(coolDaysFor(parseMoney(v))))
  }
  const onPrice = moneyChangeHandler(takePrice, baseDecimals())

  /* A pasted link - or a shop's share text - fills what it can: the name when
     there is none of yours, and the price when none is typed yet. */
  function onLink(/** @type {string} */ value) {
    setLink(value)
    const got = readShared(value)
    if (got.name && (!name.trim() || name === linkName)) { setName(got.name); setLinkName(got.name) }
    if (got.price && priceNum <= 0) takePrice(numToMoneyStr(got.price))
    // Share text in the box is tidied to the address it carries.
    if (got.link && got.link !== value.trim() && /\s/.test(value.trim())) setLink(got.link)
  }

  const dirty = isEdit
    ? !!wish && (priceNum !== (wish.price ?? 0) || name.trim() !== (wish.name ?? '')
      || (cleanLink(link) ?? '') !== (wish.link ?? '') || until !== (wish.coolUntil ?? ''))
    : priceNum > 0 || name.trim() !== '' || link.trim() !== ''
  const leaveGuard = useLeaveGuard(dirty && !saving, back)

  const linkOk = !link.trim() || !!cleanLink(link)
  const canSave = name.trim().length > 0 && priceNum > 0 && !!until && linkOk && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      if (isEdit && wish?.id != null) {
        await updateWish(wish.id, { name, price: priceNum, link, coolUntil: until })
        showToast('Wish updated')
      } else {
        await addWish({ name, price: priceNum, link, coolUntil: until })
        showToast(`On your wishlist until ${fmtDay(until)}`)
      }
      leaveGuard.leave(back)
    } catch (e) {
      console.error('[WishForm] save failed:', e)
      showToast('Could not save the wish', 'error')
      setSaving(false)
    }
  }

  // Put back and delete: each does its work, then leaves the page.
  const actions = useWishActions({ base })
  /** @param {(w: WishRow) => Promise<void>} act */
  const thenBack = (act) => async (/** @type {WishRow} */ w) => { await act(w); leaveGuard.leave(back) }

  if (isEdit && wish === null) {
    return (
      <div className="px-5 pt-safe-header">
        <IconButton label="Back" onClick={back}><IconChevronLeft /></IconButton>
        <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">This wish is not here any more.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-transparent pb-6">
      <PinnedTop className="shrink-0">
        <header className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-5 pt-safe-header pb-2 shrink-0">
          <IconButton label="Back" className="justify-self-start" onClick={leaveGuard.tryLeave}>
            <IconChevronLeft />
          </IconButton>
          <h1 className="text-base font-semibold text-slate-800 dark:text-white text-center truncate">
            {isEdit ? 'Edit wish' : 'New wish'}
          </h1>
          <span />
        </header>
      </PinnedTop>

      {/* ── Price ── */}
      <div className="flex flex-col items-center px-6 pt-12 pb-12 shrink-0">
        <AmountInput
          ref={priceRef}
          size="page"
          value={price === '0' ? '' : price}
          onChange={onPrice}
          placeholder={zeroAmount()}
          label="Price"
        />
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 tracking-wide">Price</p>
      </div>

      <div className="px-4 flex flex-col gap-4">
        {decided && wish && (
          <p className="px-1 text-13 font-medium text-slate-500 dark:text-slate-400">
            {decidedWords(wish)}
            {wish.status === 'skipped' ? ` · ${fmt(wish.price, wish.currency || undefined)} kept` : ''}
          </p>
        )}

        {/* What it is */}
        <div>
          <SectionLabel htmlFor="wish-name">What do you want</SectionLabel>
          <div className={fieldFrame()}>
            <input
              id="wish-name"
              type="text"
              placeholder="Wireless earbuds"
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white
                placeholder-slate-400 dark:placeholder-slate-500 outline-none min-w-0"
              maxLength={60}
            />
          </div>
        </div>

        {/* Where it is sold */}
        <div>
          <div className="flex items-baseline gap-2">
            <SectionLabel htmlFor="wish-link">Link</SectionLabel>
            {!linkOk && <p className="text-xs font-medium text-red-500 dark:text-red-400 mb-1.5">Not a web address</p>}
          </div>
          <div className={fieldFrame(!linkOk)}>
            <span className="text-slate-400 dark:text-slate-500 shrink-0"><IconLink /></span>
            <input
              id="wish-link"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Paste a shop link (optional)"
              value={link}
              onChange={e => onLink(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-800 dark:text-white
                placeholder-slate-400 dark:placeholder-slate-500 outline-none min-w-0"
              maxLength={2000}
            />
            {cleanLink(link) && (
              <a
                href={/** @type {string} */ (cleanLink(link))}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-12 font-semibold accent-ink active:opacity-60"
              >
                Open
              </a>
            )}
          </div>
        </div>

        {/* When to ask again: one day, set by the price until you pick one. */}
        {!decided && (
          <div>
            <SectionLabel htmlFor="wish-until">Ask me again on</SectionLabel>
            <div className={fieldFrame()}>
              <span className="text-slate-400 dark:text-slate-500 shrink-0"><IconCalendar /></span>
              <DateInput
                id="wish-until"
                value={until}
                min={dayKey(new Date())}
                onChange={e => { if (e.target.value) { setUntil(e.target.value); setChosen(true) } }}
                className="flex-1 min-w-0 bg-transparent text-sm font-medium text-slate-800 dark:text-white outline-none"
              />
            </div>
            <p className="mt-1.5 px-1 text-12 text-slate-500 dark:text-slate-400">
              {!chosen && !isEdit ? 'Set by the price. Pick another day if you like.' : 'Spendr asks you at 9 that morning.'}
            </p>
          </div>
        )}
      </div>

      <div className="px-4 pt-5">
        <Button size="lg" block onClick={handleSave} disabled={!canSave}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add to wishlist'}
        </Button>
      </div>

      {isEdit && wish && (
        <div className="px-4 pt-8">
          <FormActions wish={wish} onPutBack={thenBack(actions.putBack)} onRemove={thenBack(actions.remove)} />
        </div>
      )}

      <DiscardSheet open={leaveGuard.asking} onKeep={leaveGuard.keep} onDiscard={leaveGuard.discard} />
    </div>
  )
}

/** A chain link, for the link field. */
function IconLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}
