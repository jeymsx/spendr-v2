/**
 * Creating and editing an account: the form, and the two sheets it opens.
 *
 * Lifted out of Accounts.jsx unchanged, and the single biggest reason that
 * file was 2,547 lines - this is 1,216 of them on its own. CardStyleSheet and
 * QrCropSheet come with it because nothing else opens them.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import 'react-image-crop/dist/ReactCrop.css'
import db, { UNSYNCED } from '../../db/db'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useToast } from '../../context/ToastContext'
import { parseMoney, moneyChangeHandler, numToMoneyStr } from '../../utils/moneyInput'
import { PH_ACCOUNTS } from '../../lib/phAccounts'
import { deleteAccountRemote } from '../../lib/sync'
import { PALETTE, TYPE_OPTIONS, TYPE_LABEL, defaultRole } from '../../lib/accountMeta'
import { fmt } from '../../lib/money'
import SubPage from '../../components/SubPage'
import {
  PreviewCard,
  SchemeRail,
} from '../../components/CardStyle'
import { IconCard, IconWalletUI, IconBankUI, IconTrash } from '../../components/icons'
import Button from '../../components/ui/Button'
import Sheet from '../../components/ui/Sheet'
import Divider from '../../components/ui/Divider'
import SectionLabel from '../../components/ui/SectionLabel'
import MoneyField from '../../components/ui/MoneyField'
import { inputClass } from './shared'
import { CardStyleSheet } from './CardStyleSheet'
import { QrCropSheet } from './QrSheets'

// ── Account form sheet ─────────────────────────────────────────────────────────

/**
 * Form values to an accounts row.
 *
 * Exported because two screens create accounts now - this sheet and the
 * /accounts/new page - and they must not drift on the details that are easy
 * to get subtly wrong: that a credit card forces role 'credit', that every
 * non-credit account nulls all five credit fields rather than storing zeroes,
 * that currency is always PHP, and that an empty network is null and not ''.
 */
export function buildAccountRow({
  name, type, role, color, creditLimit,
  statementDay, dueDay, cutoffDay, minPayment,
  qrImage = null, parentName = null, scheme = '',
  design, customColor,
}) {
  const isCredit = type === 'credit'
  return {
    name:           String(name ?? '').trim(),
    type,
    role:           isCredit ? 'credit' : role,
    color,
    currency:       'PHP',
    creditLimit:    isCredit ? (parseMoney(creditLimit) || 0)   : null,
    statementDate:  isCredit ? (parseInt(statementDay) || null) : null,
    dueDate:        isCredit ? (parseInt(dueDay)       || null) : null,
    cutoffDate:     isCredit ? (parseInt(cutoffDay)    || null) : null,
    minimumPayment: isCredit ? (parseMoney(minPayment) || 0)    : null,
    qrImage:        qrImage ?? null,
    updatedAt:      new Date().toISOString(),
    parentName:     parentName ?? null,
    // Unindexed on purpose: nothing queries by network, so this needed no
    // db.version() bump.
    scheme:         scheme || null,
    // Same - unindexed, no version bump. Spread conditionally rather than
    // written as `design: design ?? null`, because this row is also the patch
    // for db.accounts.update() when editing: an explicit key would overwrite
    // a chosen design with null every time the edit form saved, and the
    // account form has no design field to put back.
    ...(design ? { design } : {}),
    // Same conditional spread, same reason: this row doubles as the patch for
    // db.accounts.update() when editing, and the edit form has no colour-
    // override field - an explicit key would clear the flag on every save.
    ...(customColor === undefined ? {} : { customColor: !!customColor }),
  }
}

/**
 * Inserts a new account and its balance record together. The `balances` table
 * is what the ledger reads, so writing one without the other leaves an
 * account that exists but has no balance.
 */
export async function createAccount(row, balance) {
  const opening = Number.isFinite(balance) ? balance : 0
  await db.transaction('rw', [db.accounts, db.balances], async () => {
    await db.accounts.add({ ...row, balance: opening })
    await db.balances.put({ account: row.name, balance: opening })
  })
}

/**
 * The account form, as a bottom sheet or as a whole page.
 *
 * `variant` decides the chrome and nothing else - every field, the save, the
 * delete and the balance adjustment are the same code either way, which is
 * the point. Editing is a page on mobile because it is long: name, kind,
 * network, role, five credit fields, grouping and a QR photo do not belong
 * in something you drag up from the bottom of the screen. Creating from a
 * preset stays a sheet, and so does the desktop, where a sheet is already
 * rendered as a centred modal by the .web rules in index.css.
 */
export function AccountFormSheet({ open, onClose, account, prefill = null, variant = 'sheet' }) {
  const isPage = variant === 'page'
  const { showToast } = useToast()
  const [saving,     setSaving]     = useState(false)
  const [mode,       setMode]       = useState('form') // 'form' | 'confirm-delete'
  const [deleteBlocked, setDeleteBlocked] = useState(null)

  /* No scroll lock of its own any more, and no condition to get wrong.

     It used to be conditional because the lock is what stops the body
     scrolling behind a sheet: on a page the body IS the form, and locking it
     left everything below the colour row unreachable - but once the delete
     confirmation was up there was a sheet again, and the form behind it
     should sit still. Both of those are a <Sheet> now, and a Sheet locks the
     body for exactly as long as it is up. */

  const [name,           setName]           = useState('')
  const [type,           setType]           = useState('cash')
  const [role,           setRole]           = useState('spending')
  const [color,          setColor]          = useState(PALETTE[0])
  const [startingBal,    setStartingBal]    = useState('0')
  const [creditLimit,    setCreditLimit]    = useState('0')
  const [statementDay,   setStatementDay]   = useState('')
  const [dueDay,         setDueDay]         = useState('')
  const [cutoffDay,      setCutoffDay]      = useState('')
  const [minPayment,     setMinPayment]     = useState('0')
  const [nameError,      setNameError]      = useState(false)
  const [qrImage,        setQrImage]        = useState(null)
  const [qrCropOpen,     setQrCropOpen]     = useState(false)
  const [qrSrc,          setQrSrc]          = useState(null)
  const qrFileRef = useRef(null)
  const [parentName,     setParentName]     = useState(null)
  const [scheme,         setScheme]         = useState('')
  const [design,         setDesign]         = useState('')
  const [customColor,    setCustomColor]    = useState(false)
  const [styleOpen,      setStyleOpen]      = useState(false)
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), [], [])

  const isEdit = !!account?.id

  /**
   * The institution's own colour, recovered from its name.
   *
   * ColorRail's first swatch puts the house colours back, so it has to know
   * what they were - and for a brand with no hard-coded gradient the only
   * record of that is the preset grid the account was made from. Looked up
   * by name rather than stored, because the name is already the key
   * everywhere else that resolves a brand.
   */
  const presetColor = useMemo(() => {
    const n = name.trim().toLowerCase()
    return PH_ACCOUNTS.find(p => p.name.toLowerCase() === n)?.color ?? null
  }, [name])

  /**
   * The shape components/CardStyle.jsx speaks.
   *
   * The form keeps one useState per field, which is right for a form; the
   * card components came from the create flow's reducer and take a draft
   * plus a patch function. Adapting here means neither side has to change,
   * and there is exactly one copy of the truth - these fields - rather than
   * a draft that could drift from them.
   */
  const draft = { name, type, color, customColor, design, scheme, creditLimit, presetColor }
  const setDraft = useCallback((patch) => {
    if ('color'       in patch) setColor(patch.color)
    if ('customColor' in patch) setCustomColor(patch.customColor)
    if ('design'      in patch) setDesign(patch.design)
    if ('scheme'      in patch) setScheme(patch.scheme)
  }, [])

  useEffect(() => {
    if (!open) return
    // Hydrate-on-open. The sheet renders null when closed but stays
    // mounted through its own exit animation, so the parent can neither
    // unmount nor re-key it to reset these fields for the next record.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode('form')
    setDeleteBlocked(null)
    setSaving(false)
    setNameError(false)
    if (account?.id) {
      const t = account.type ?? 'cash'
      setName(account.name ?? '')
      setType(t)
      setRole(account.role ?? defaultRole(t))
      setColor(account.color ?? PALETTE[0])
      setStartingBal(numToMoneyStr(account.balance ?? 0))
      setCreditLimit(numToMoneyStr(account.creditLimit ?? 0))
      setStatementDay(account.statementDate != null ? String(account.statementDate) : '')
      setDueDay(account.dueDate != null ? String(account.dueDate) : '')
      setCutoffDay(account.cutoffDate != null ? String(account.cutoffDate) : '')
      setMinPayment(numToMoneyStr(account.minimumPayment ?? 0))
      setQrImage(account.qrImage ?? null)
      setParentName(account.parentName ?? null)
      setScheme(account.scheme ?? '')
      setDesign(account.design ?? '')
      setCustomColor(!!account.customColor)
    } else {
      const t = prefill?.type ?? 'cash'
      setName(prefill?.name ?? '')
      setType(t)
      setRole(prefill?.role ?? defaultRole(t))
      setColor(prefill?.color ?? PALETTE[Math.floor(Math.random() * PALETTE.length)])
      setStartingBal('0')
      setCreditLimit('0')
      setStatementDay('')
      setDueDay('')
      setCutoffDay('')
      setMinPayment('0')
      setQrImage(null)
      setParentName(prefill?.parentName ?? null)
      setScheme('')
      setDesign('')
      // A preset hands over its house colour, which is not an override.
      setCustomColor(false)
    }
    // Hydrates the form when the sheet opens. Listing every field would
    // re-run the effect that SETS them and clobber edits in progress;
    // `open` plus the record id is what actually means "something else is
    // being edited now".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account?.id])

  /* All that is left of close(): the page's Back button, which is not a sheet
     dismissal and so keeps the in-flight guard by hand. The sheet's copy of
     that guard is `dismissible={!saving}`, and the exit animation it used to
     run here belongs to Sheet. */
  const close = () => { if (!saving) onClose() }

  /* The picker opens from the form, not from inside the crop sheet.

     It used to be the sheet's job, which meant tapping "Add Payment QR"
     opened a sheet whose entire content was a second dashed box saying
     "Choose a photo" - a whole screen spent asking again. Now the sheet is
     only ever entered with an image in hand, and it is only ever about the
     crop. */
  const pickQrFile = () => qrFileRef.current?.click()

  function onQrFileChange(e) {
    const file = e.target.files?.[0]
    // Cleared before the early return, so picking the SAME file again still
    // fires a change event.
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setQrSrc(reader.result); setQrCropOpen(true) }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!name.trim()) { setNameError(true); return }
    setSaving(true)
    try {
      const cleanName = name.trim()
      const data = buildAccountRow({
        name: cleanName, type, role, color, creditLimit,
        statementDay, dueDay, cutoffDay, minPayment,
        qrImage, parentName, scheme, design, customColor,
      })

      if (isEdit) {
        const oldName = account.name
        await db.transaction('rw', [db.accounts, db.balances, db.transactions, db.goals], async () => {
          await db.accounts.update(account.id, data)
          if (oldName !== cleanName) {
            // Migrate balance record
            const bal = await db.balances.get(oldName)
            if (bal) {
              await db.balances.delete(oldName)
              await db.balances.put({ account: cleanName, balance: bal.balance })
            }
            // Migrate transaction references
            const byAcct = await db.transactions.where('account').equals(oldName).toArray()
            for (const tx of byAcct) await db.transactions.update(tx.id, { account: cleanName })
            const byFrom = await db.transactions.where('fromAccount').equals(oldName).toArray()
            for (const tx of byFrom) await db.transactions.update(tx.id, { fromAccount: cleanName })
            const byTo = await db.transactions.where('toAccount').equals(oldName).toArray()
            for (const tx of byTo) await db.transactions.update(tx.id, { toAccount: cleanName })
            // Update children's parentName reference
            await db.accounts.where('parentName').equals(oldName).modify({ parentName: cleanName })
            // Goals name their funding accounts. `accounts` is a multi-entry
            // index, so where().equals() finds the goals holding this name
            // without scanning the table - see the v9 comment in db/db.js.
            // Missing this would leave a goal pointing at an account that no
            // longer exists, and it would silently read as ₱0 funded.
            const linked = await db.goals.where('accounts').equals(oldName).toArray()
            for (const g of linked) {
              await db.goals.update(g.id, {
                accounts: (g.accounts ?? []).map(n => (n === oldName ? cleanName : n)),
                updatedAt: new Date().toISOString(),
                synced: 0,
              })
            }
          }

          /* The balance correction, inside the same transaction as the rename
             above and deliberately after it: the rename has already moved
             every row onto cleanName, so this one is written against the name
             the account now has rather than the one it had when the form
             opened. Either both land or neither does.

             The row is an ordinary inflow or expense, not a special kind:
             the balance IS the ledger, so the only honest way to change it is
             to add the movement that explains the difference. */
          if (adjustDiff !== 0) {
            const now = new Date()
            const nowISO = now.toISOString()
            await db.transactions.add({
              txId:        crypto.randomUUID(),
              type:        adjustDiff > 0 ? 'inflow' : 'expense',
              date:        nowISO,
              description: 'Balance adjustment',
              category:    adjustDiff > 0 ? 'Income' : 'Others',
              account:     cleanName,
              amount:      Math.abs(adjustDiff),
              synced:      UNSYNCED,
              updatedAt:   nowISO,
            })
            const newBal = parseMoney(startingBal)
            await db.accounts.update(account.id, { balance: newBal, updatedAt: nowISO })
            await db.balances.put({ account: cleanName, balance: newBal })
          }
        })
      } else {
        await createAccount(data, parseMoney(startingBal))
      }
      showToast(
        !isEdit ? 'Account created'
        : adjustDiff !== 0 ? `Balance corrected to ${fmt(parseMoney(startingBal))}`
        : 'Account updated',
      )
      close()
    } catch (e) {
      console.error('[AccountForm] save failed:', e)
      showToast('Failed to save account', 'error')
      setSaving(false)
    }
  }

  async function handleDeleteCheck() {
    const byAcct = await db.transactions.where('account').equals(account.name).count()
    const byFrom = await db.transactions.where('fromAccount').equals(account.name).count()
    const byTo   = await db.transactions.where('toAccount').equals(account.name).count()
    const txTotal = byAcct + byFrom + byTo
    // Also block if this account has sub-accounts
    const childCount = await db.accounts.where('parentName').equals(account.name).count()
    setDeleteBlocked(childCount > 0 ? `sub-accounts` : txTotal > 0 ? txTotal : null)
    setMode('confirm-delete')
  }

  async function handleDelete() {
    if (deleteBlocked) return
    setSaving(true)
    try {
      await db.transaction('rw', [db.accounts, db.balances, db.goals], async () => {
        await db.accounts.delete(account.id)
        // Unhook it from any goal it was funding, so no goal is left
        // pointing at an account that is gone.
        const linked = await db.goals.where('accounts').equals(account.name).toArray()
        for (const g of linked) {
          await db.goals.update(g.id, {
            accounts: (g.accounts ?? []).filter(n => n !== account.name),
            updatedAt: new Date().toISOString(),
            synced: 0,
          })
        }
        await db.balances.delete(account.name)
      })
      // Without this the next pull re-adds the account from Supabase.
      await deleteAccountRemote(account.name)
      close()
    } catch (e) {
      console.error('[AccountForm] delete failed:', e)
      showToast('Failed to delete account', 'error')
      setSaving(false)
    }
  }

  const isParentItself = (allAccounts ?? []).some(a => a.parentName === account?.name)
  const potentialParents = (allAccounts ?? []).filter(a =>
    !a.parentName && a.type !== 'credit' && a.name !== name
  )

  /* The page can bail the moment it is closed; the sheet must not. Sheet
     keeps rendering its children for the 240ms its exit animation takes, and
     returning null here would cut that short. */
  if (isPage && !open) return null

  /* Hoisted out of the adjust block, which used to be an IIFE: the Apply
     button is Sheet's footer now, and it needs the same difference the
     preview inside the body shows. */
  /* What saving will write, if anything. Zero for a new account and for a
     credit card, neither of which shows the field. */
  const adjustDiff = isEdit && type !== 'credit'
    ? parseMoney(startingBal) - (account?.balance ?? 0)
    : 0

  /* The delete confirmation's content, defined once.

     In the sheet it replaces the sheet's body, which is what a sheet is for.
     On a page it cannot do that: swapping a whole screen for three lines and
     a button left the form gone, the header describing a screen that was no
     longer there, and two thirds of the display empty. It is a modal over
     the page instead - the form stays where it was, which is also the honest
     picture of what is happening, since nothing has been deleted yet. */
  const deleteBody = (
    <>
            {deleteBlocked ? (
              <>
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-2">
                  Cannot delete <span className="font-semibold text-slate-800 dark:text-white">{account?.name}</span>
                </p>
                <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-6 leading-relaxed">
                  {deleteBlocked === 'sub-accounts'
                    ? 'This account has sub-accounts. Delete or re-assign them first.'
                    : `This account has ${deleteBlocked} ${deleteBlocked === 1 ? 'transaction' : 'transactions'}. Remove those transactions first.`}
                </p>
                <Button variant="secondary" block onClick={() => setMode('form')}>
                  Go back
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-center text-slate-500 dark:text-slate-400 mb-1">
                  Permanently delete <span className="font-semibold text-slate-800 dark:text-white">{account?.name}</span>?
                </p>
                <p className="text-xs text-center text-slate-400 dark:text-slate-500 mb-6">
                  This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setMode('form')} disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-[2]"
                    onClick={handleDelete} disabled={saving}
                  >
                    {saving ? 'Deleting…' : 'Delete account'}
                  </Button>
                </div>
              </>
            )}
    </>
  )

  /* One body, two chromes. Everything below is identical whether this is a
     sheet or a page - only the frame around it changes, at the bottom of the
     component. */
  const inner = (
    <>
        {/* ── Form mode ──
            Still rendered under the page's delete modal: the account has not
            been deleted, so the form has no business disappearing. */}
        {(mode === 'form' || (isPage && mode === 'confirm-delete')) && (
          <div className="px-5 pt-5 pb-2 flex flex-col gap-4">

            {/* The card, lying flat, at the top.

                This screen used to open on a text input, which is a strange
                way to start editing something whose whole point is that it
                looks like a card. It is the same face the create flow shows
                while you fill it in, and it updates on every keystroke and
                every tap below.

                Flat rather than upright because this is a preview, not a
                choice - the card only stands up in Customise card, where the
                thing being chosen IS how it looks. */}
            <div className="pt-1 pb-1">
              <PreviewCard draft={draft} large />

              {/* One button rather than a design row inline. The gallery is
                  six full card faces and a colour row; opening it in place
                  would push every field on this page below the fold. */}
              <button
                type="button"
                onClick={() => setStyleOpen(true)}
                className="mx-auto mt-4 flex items-center gap-2 px-4 py-2 rounded-full
                  text-xs font-semibold text-primary
                  bg-primary/[0.08] dark:bg-primary/[0.14]
                  border border-primary/20 dark:border-primary/25
                  active:scale-95 transition-transform duration-75"
              >
                <IconCard size={14} />
                Customise card
              </button>
            </div>

            {/* Name */}
            <div>
              <SectionLabel>Account name</SectionLabel>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setNameError(false) }}
                placeholder="e.g. BDO Savings"
                maxLength={40}
                className={inputClass(nameError)}
              />
              {nameError && <p className="text-xs text-red-500 mt-1.5 px-1">Name is required</p>}
            </div>

            {/* Type */}
            <div>
              <SectionLabel>Account type</SectionLabel>
              {isEdit ? (
                <p className="h-[48px] flex items-center px-4 rounded-2xl text-sm font-medium text-slate-700 dark:text-slate-300
                  bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.09]">
                  {TYPE_LABEL[type]}
                  <span className="ml-2 text-xs text-slate-400 dark:text-slate-500 font-normal">(cannot change)</span>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => { setType(o.value); setRole(defaultRole(o.value)) }}
                      className={[
                        'px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                        type === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {o.shortLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Card network — what the plastic actually carries. Cash has no
                network; everything else can, since PH e-wallets issue Visa and
                Mastercard debit too. Stored unindexed, so no migration.

                The marks themselves, not their names in chips: the mark IS
                the name on a real card, and it is what you look at to check
                which network yours is on. Same control as the create flow. */}
            {type !== 'cash' && (
              <div>
                <SectionLabel>Card network</SectionLabel>
                <SchemeRail value={scheme} onChange={v => setScheme(v)} />
              </div>
            )}

            {/* Counts as — hidden for credit */}
            {type !== 'credit' && (
              <div>
                <SectionLabel>Counts as</SectionLabel>
                <div className="flex gap-2">
                  {[
                    { value: 'spending', label: 'Spending', Icon: IconWalletUI },
                    { value: 'savings',  label: 'Savings',  Icon: IconBankUI   },
                  ].map(o => (
                    <button
                      key={o.value}
                      onClick={() => setRole(o.value)}
                      className={[
                        'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-75 active:scale-95',
                        role === o.value
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      <o.Icon size={15} />
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 px-1">
                  How this account is grouped on the home screen
                </p>
              </div>
            )}

            {/* No colour row here.

                It was one, briefly, and it was the same control that sits in
                Customise card two taps away - so the page asked about the
                card's appearance in two places and left the reader to work
                out whether they were the same setting. Appearance lives
                behind the one button, next to the design it belongs with;
                this page is the account's facts. */}

            {/* Group under parent */}
            {type !== 'credit' && !isParentItself && potentialParents.length > 0 && (
              <div>
                <SectionLabel>Group under</SectionLabel>
                {/* One line that scrolls, not a wrapping block.

                    Wrapped, this grew a row for every account you own and
                    pushed the rest of the form down by however many that
                    happens to be - the one field on the page whose height
                    depended on your data. It scrolls now, like the network
                    row above it, and None stays pinned at the left margin
                    where the default belongs. */}
                {/* No snapping. snap-start on the first chip made the
                    browser align it to the scrollport's edge on load, which
                    ate the 20px of padding and left None flush against the
                    screen, 20px left of its own label. Chips are not pages;
                    there is nothing here worth snapping to. */}
                <div
                  className="flex items-center gap-2 overflow-x-auto no-scrollbar px-5 -mx-5 py-0.5"
                  style={{ touchAction: 'pan-x pan-y', overscrollBehaviorX: 'contain' }}
                >
                  <button
                    onClick={() => setParentName(null)}
                    className={[
                      'shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                      parentName === null
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                    ].join(' ')}
                  >
                    None
                  </button>
                  {potentialParents.map(acct => (
                    <button
                      key={acct.id}
                      onClick={() => setParentName(acct.name)}
                      className={[
                        'shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-75 active:scale-95',
                        parentName === acct.name
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {acct.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

{/* The balance, in both modes.

                Editing it used to mean leaving: an "Adjust balance" pill in
                the corner swapped the whole form for a second screen with a
                read-only "Current balance" card, one input, and its own
                Cancel and Apply pair. Three of those four things were already
                on the form you came from, and the fourth is a number you
                type - which is a field, not a screen.

                So it is a field. What makes it safe to edit directly is the
                line underneath: the balance is not a number the app stores
                for you, it is the sum of your ledger, and correcting it
                WRITES a transaction. Saying so as you type is the whole
                design - the old screen said it too, but only after you had
                committed to going there.

                Not for credit cards: what they owe comes off the statement
                and the ledger, and typing over it would be a fiction. The
                old pill was hidden for them too. */}
            {(!isEdit || type !== 'credit') && (
              <div>
                <SectionLabel>{isEdit ? 'Balance' : 'Starting balance'}</SectionLabel>
                <MoneyField
                  value={startingBal === '0' ? '' : startingBal}
                  onChange={moneyChangeHandler(setStartingBal)}
                />
                {isEdit && adjustDiff !== 0 && (
                  <p className={`mt-2 px-1 text-[12px] font-medium ${
                    adjustDiff > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  }`}>
                    {adjustDiff > 0
                      ? `Records a ${fmt(adjustDiff)} inflow to correct the balance`
                      : `Records a ${fmt(Math.abs(adjustDiff))} expense to correct the balance`}
                  </p>
                )}
              </div>
            )}

            {/* Credit-only fields */}
            {type === 'credit' && (
              <div className="flex flex-col gap-4 pt-1">
                <Divider />

                <div>
                  <SectionLabel>Credit limit</SectionLabel>
                  <MoneyField
                    value={creditLimit === '0' ? '' : creditLimit}
                    onChange={moneyChangeHandler(setCreditLimit)}
                  />
                </div>

                <div>
                  <SectionLabel>Minimum payment</SectionLabel>
                  <MoneyField
                    value={minPayment === '0' ? '' : minPayment}
                    onChange={moneyChangeHandler(setMinPayment)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <SectionLabel>Statement</SectionLabel>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={statementDay}
                      onChange={e => setStatementDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                  <div>
                    <SectionLabel>Due</SectionLabel>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={dueDay}
                      onChange={e => setDueDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                  <div>
                    <SectionLabel>Cutoff</SectionLabel>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1" max="31"
                      value={cutoffDay}
                      onChange={e => setCutoffDay(e.target.value)}
                      placeholder="1–31"
                      className={inputClass(false)}
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1 -mt-2">
                  Statement day = billing closes · Due day = payment deadline · Cutoff = new cycle starts
                </p>
              </div>
            )}

            {/* Payment QR.

                Adding one used to take two taps at a dashed box that said
                the same thing twice: this one opened a sheet whose empty
                state was another dashed box, and only THAT opened the
                picker. The picker opens from here now, and the sheet appears
                with the photo already in it, cropping.

                The preview is bigger and it is a button - tapping the QR you
                are looking at to replace it is the obvious move, and the two
                pills beside it were the only way to do anything. */}
            <div>
              <SectionLabel>Payment QR <span className="font-normal text-slate-400 normal-case">(optional)</span></SectionLabel>
              {qrImage ? (
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={pickQrFile}
                    className="shrink-0 rounded-2xl overflow-hidden bg-white
                      border border-slate-200/80 dark:border-white/10
                      active:scale-95 transition-transform duration-75"
                    aria-label="Replace payment QR"
                  >
                    <img
                      src={qrImage}
                      alt="Payment QR"
                      className="block object-cover"
                      style={{ width: 96, height: 134 }}
                    />
                  </button>
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
                      Shown on this account so you can be paid without opening the bank app.
                    </p>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={pickQrFile}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold
                          text-primary bg-primary/[0.08] dark:bg-primary/[0.12]
                          active:bg-primary/[0.15] transition-colors"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrImage(null)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold
                          text-red-500 dark:text-red-400
                          active:bg-red-50 dark:active:bg-red-500/10 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={pickQrFile}
                  className="w-full flex items-center justify-center gap-2.5 py-5 rounded-2xl
                    border-2 border-dashed border-slate-200 dark:border-white/10
                    text-slate-400 dark:text-slate-500
                    active:bg-slate-50 dark:active:bg-white/[0.04] transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                  </svg>
                  <span className="text-sm font-medium">Choose a screenshot</span>
                </button>
              )}
              <input
                ref={qrFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onQrFileChange}
              />
            </div>

            {/* Save, on the page only.

                No Cancel beside it there: the back button in the header is
                the cancel, and offering two of them side by side invites the
                question of whether they do different things. In the sheet the
                Cancel/Save pair is Sheet's footer, pinned under the body so
                it cannot scroll out of reach. */}
            {isPage && (
              <div className="flex gap-3 pt-2">
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
                </Button>
              </div>
            )}

            {/* Last, and quiet. Text on the page rather than a filled red
                button: deleting an account is rare and irreversible, and a
                solid red block competes with Save for the eye every time
                someone comes here to change a credit limit. */}
            {isPage && isEdit && (
              <button
                onClick={handleDeleteCheck}
                disabled={saving}
                className="mt-1 mx-auto px-4 py-2.5 rounded-xl text-[13px] font-semibold
                  text-red-500 dark:text-red-400 disabled:opacity-40
                  active:bg-red-50 dark:active:bg-red-500/10 transition-colors"
              >
                Delete account
              </button>
            )}
          </div>
        )}

        {/* ── Confirm delete mode ──
            The heading came out of the panel header and into the body: it is
            centred and topped with the trash icon, which is not what Sheet's
            left-aligned title is, so the dialog is named by ariaLabel
            instead. flex rather than text-center because Preflight sets
            `svg { display: block }`, so the icon was a block box inside a
            text-align container and sat against the left padding. */}
        {mode === 'confirm-delete' && !isPage && (
          <div className="px-5 pt-1 pb-2">
            <div className="flex flex-col items-center mb-5">
              <span className="text-red-500 dark:text-red-400"><IconTrash size={24} /></span>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mt-2">Delete account?</h3>
            </div>
            {deleteBody}
          </div>
        )}
        <div className="h-8" />
    </>
  )

  /* The sheet's chrome, by mode. On a page none of it applies - SubPage
     carries the title and Back, and the buttons stay in the body. */
  const sheetTitle =
    mode === 'form' ? (isEdit ? 'Edit Account' : 'New Account')
    /* confirm-delete keeps its centred, icon-topped heading in the body, so
       the dialog takes its name from ariaLabel instead. */
    : null

  const sheetTitleAction =
    mode === 'form' && isEdit ? (
      /* Only in the sheet. On a page Delete is the last thing on the form
         instead - a destructive action does not belong at the top of a
         screen, a thumb's width from Back. */
      <button
        onClick={handleDeleteCheck}
        className="text-xs font-semibold text-red-500 dark:text-red-400 px-3 py-1.5 rounded-xl
          bg-red-50 dark:bg-red-500/10 active:bg-red-100 dark:active:bg-red-500/20 transition-colors"
      >
        Delete
      </button>
    ) : null

  /* Pinned under the body rather than trailing it. The panel is capped at
     92dvh and scrolls, so on a short screen Save sat below the fold. */
  const sheetFooter =
    mode === 'form' ? (
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button className="flex-[2]" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
        </Button>
      </div>
    ) : null

  return (
    <>
    {isPage ? (
      /* Title and Back both follow `mode`. The page swaps its whole body for
         the confirmation, so leaving it headed "Edit account" described a
         screen that was no longer there - and Back would have left the
         account entirely rather than returning to the form behind it. */
      <SubPage
        title={isEdit ? 'Edit Account' : 'New Account'}
        onBack={mode === 'form' ? close : () => setMode('form')}
      >
        {inner}
      </SubPage>
    ) : (
      /* The overlay, the panel, the grab handle, the scroll lock, Escape, the
         focus trap, the dialog role and the exit animation all live in
         <Sheet> now.

         -mx-5 cancels Sheet's page gutter, and has to: `inner` is the PAGE's
         body as well, SubPage draws no gutter of its own, and every block
         inside carries its own px-5. Undoing it once here is the one place
         that knows about both. */
      <Sheet
        open={open}
        onClose={onClose}
        dismissible={!saving}
        maxHeight="92dvh"
        title={sheetTitle}
        /* Only reaches the dialog in confirm-delete mode, where sheetTitle is
           null because that heading stays in the body. Sheet ignores it
           whenever there is a title. */
        ariaLabel="Delete account"
        titleAction={sheetTitleAction}
        footer={sheetFooter}
      >
        <div className="-mx-5">{inner}</div>
      </Sheet>
    )}

    {/* Over the page, with the form still behind it.

        A bottom sheet rather than a centred dialog, for two reasons that
        both check out in this repo. Every other confirmation here is one -
        DupWarningSheet and OverdrawWarningSheet are the same shape, a
        warning with two ways out - and a centred box would have been the
        only dialog of its kind in the app. And `html.web .sheet-panel` in
        index.css already re-positions any sheet as a centred modal on
        desktop, so this IS centred there, for free; a hand-rolled centred
        box would have stayed a phone-sized card in the middle of a 1440px
        screen.

        Which is exactly what <Sheet> is, so it is one now - and it gains the
        exit animation, Escape and the focus trap it never had as a static
        panel. `open` rather than a && , so the exit has something to play
        on; Sheet renders nothing when it is closed. */}
    <Sheet
      open={isPage && mode === 'confirm-delete'}
      onClose={() => setMode('form')}
      z={150}
      scrim={55}
      dismissible={!saving}
      ariaLabel="Delete account"
    >
      {/* flex rather than text-center because Preflight sets
          `svg { display: block }`, so the icon was a block box inside a
          text-align container and sat against the left padding. */}
      <div className="flex flex-col items-center">
        <span className="text-red-500 dark:text-red-400"><IconTrash size={24} /></span>
        <h3 className="text-base font-semibold text-slate-800 dark:text-white mt-2">
          Delete account?
        </h3>
      </div>
      <div className="pt-4">{deleteBody}</div>
    </Sheet>

    <CardStyleSheet
      open={styleOpen}
      onClose={() => setStyleOpen(false)}
      draft={draft}
      set={setDraft}
    />

    <QrCropSheet
      open={qrCropOpen}
      initialSrc={qrSrc}
      onClose={() => { setQrCropOpen(false); setQrSrc(null) }}
      onConfirm={base64 => setQrImage(base64)}
    />
    </>
  )
}
