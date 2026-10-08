import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { fullSync, pullChanges, applyRemoteTransaction, toShareRow, unsentTables, FirstSyncChoiceNeeded } from '../lib/sync'
import { startRealtime } from '../lib/realtime'
import { startShare } from '../lib/liveShare'
import { watchLocalChanges } from '../lib/localChanges'
import { remoteToastMessage } from '../lib/remoteToast'
import db, { getUnsyncedTxs } from '../db/db'
import { setSyncState } from '../hooks/useSyncState'
import ReminderSync from './ReminderSync'
import NotificationSync from './NotificationSync'
import FirstSyncSheet from './FirstSyncSheet'

// ── Context ───────────────────────────────────────────────────────────────────

const SyncContext = createContext(null)

export function useSyncManager() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncManager must be used inside SyncManager')
  return ctx
}

// ── Status icons ──────────────────────────────────────────────────────────────

function IconSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )
}

function IconCheckCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function IconAlertCircle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

// ── Indicator pill ────────────────────────────────────────────────────────────

function SyncIndicator({ status, errMsg }) {
  const visible = status !== 'idle'

  if (!visible) return null

  const styles = {
    syncing: {
      pill: 'bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900',
      icon: <span className="animate-spin inline-block"><IconSpinner /></span>,
      label: 'Syncing…',
    },
    success: {
      pill: 'bg-emerald-500 text-white',
      icon: <IconCheckCircle />,
      label: 'Synced',
    },
    error: {
      pill: 'bg-red-500 text-white',
      icon: <IconAlertCircle />,
      label: 'Sync failed',
    },
  }[status] ?? null

  if (!styles) return null

  return (
    <div
      className="fixed right-4 z-[400] flex flex-col items-end gap-0.5 transition-all duration-300"
      style={{ top: 'max(3.5rem, calc(env(safe-area-inset-top) + 0.75rem))' }}
    >
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full
        text-11 font-semibold shadow-lg ${styles.pill}`}
      >
        {styles.icon}
        <span>{styles.label}</span>
      </div>
      {status === 'error' && errMsg && (
        <div className="max-w-[220px] px-3 py-1 rounded-full bg-red-600 text-white text-10 shadow-lg truncate">
          {errMsg}
        </div>
      )}
    </div>
  )
}

/* How long a burst is given to finish before it is sent, or read. Short: it is
   what a person feels between saving on one device and seeing it on the
   other. A save writes several rows in a few milliseconds (the transaction,
   the balance it moved), and a push touches many, so a moment is enough to
   make each of those one trip rather than several. */
const PUSH_WAIT = 300
const PULL_WAIT = 250

// Module-level lock — survives React StrictMode double-mount so two concurrent
// fullSync calls never race on the same empty IndexedDB and create duplicates.
let _syncLocked = false

// ── SyncManager ───────────────────────────────────────────────────────────────
// Acts as both a React Router layout route (renders <Outlet />) and a
// context provider. Manages auto-sync on mount and window-focus.

export default function SyncManager() {
  const { user, signOut } = useAuth()
  const [status,   setStatus]   = useState('idle') // 'idle' | 'syncing' | 'success' | 'error'
  const [errMsg,   setErrMsg]   = useState('')
  /* This device meeting an account that already has data: the question, and
     the answer being carried out. See lib/firstSync.js. */
  const [firstSync, setFirstSync] = useState(/** @type {import('../lib/sync').FirstSyncInfo|null} */ (null))
  const [choosing,  setChoosing]  = useState(/** @type {import('../lib/sync').FirstSyncChoice|null} */ (null))
  const syncingRef = useRef(false)
  const dismissRef = useRef(null)
  /** The user the last successful sync in this session was for. */
  const syncedFor  = useRef(/** @type {string|null} */ (null))
  const { showToast } = useToast()
  const showToastRef = useRef(showToast)
  useEffect(() => { showToastRef.current = showToast })
  /* Whether the cloud is telling this device what changes (lib/realtime.js):
     'on' when it is, 'connecting' while it finds out, 'off' when it cannot -
     in which case a slow pull on a timer stands in. */
  const [live, setLive] = useState(/** @type {import('../lib/realtime').LiveState} */ ('off'))
  /* What came in while a sync was already running, to be done once it ends:
     a pull for what another device did, a push for what this one did. */
  const followUp = useRef({ pull: false, push: false, rechecks: 0 })
  // Set below, once the things it runs exist; read when a sync ends.
  const followUpRef = useRef(() => {})
  /* The tables this device has written to since it last sent them, so a push
     started by a change sends those and not every table (lib/localChanges.js
     says which write counts). */
  const dirty = useRef(/** @type {Set<string>} */ (new Set()))
  /* Transactions heard from another device that are waiting to go into the
     ledger, by their id, and whether that is being done. */
  const heardRows = useRef(/** @type {Map<string, Record<string, any>>} */ (new Map()))
  const draining = useRef(false)
  // Set below, once the drain exists; read when a sync ends.
  const drainRef = useRef(() => {})
  // The channel this device tells its other devices on, once it is joined (lib/liveShare.js).
  const sharing = useRef(/** @type {ReturnType<typeof startShare>|null} */ (null))
  /* The tables other devices have changed since this one last read them, by
     their names in the cloud - `*` for any - so a pull reads those and not
     every table. */
  const pullTables = useRef(/** @type {Set<string>} */ (new Set()))
  const timers = useRef(/** @type {{pull: ReturnType<typeof setTimeout>|null, push: ReturnType<typeof setTimeout>|null}} */ ({ pull: null, push: null }))

  /* Where this session stands with the cloud, for the readers that must not
     act on a ledger that has not caught up - see hooks/useSyncState.js. A
     layout effect, so it is in place before any child's effect reads it. */
  useLayoutEffect(() => {
    const signedIn = !!user?.id && isSupabaseConfigured
    setSyncState({ caughtUp: !signedIn || syncedFor.current === user?.id })
  }, [user?.id])

  /** @returns {Promise<boolean>} whether a sync ran to the end */
  /** Say so when another device has added to the ledger (lib/remoteToast.js). */
  const announce = useCallback((/** @type {Array<Record<string, any>>} */ added) => {
    const message = remoteToastMessage(added)
    if (message) showToastRef.current(message, 'success', { ifIdle: true })
  }, [])

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.silent]  no chip unless it fails
   * @param {import('../lib/sync').FirstSyncChoice|null} [opts.choice]
   * @param {boolean} [opts.light]  the session as it is, not refreshed: a push after every save cannot ask the auth server each time
   * @param {boolean} [opts.auto]   started by a change, not by a person: nobody is told if it cannot (it tries again at the next one)
   * @param {boolean} [opts.changes] sent because of what this device wrote: the ledger goes up first, and only the tables written to
   * @returns {Promise<boolean>} whether a sync ran to the end
   */
  const runSync = useCallback(async ({ silent = false, choice = null, light = false, auto = false, changes = false } = {}) => {
    if (!user?.id) return false
    if (syncingRef.current || _syncLocked) {
      // Not lost: said again when the one in progress ends.
      if (auto) followUp.current.push = true
      return false
    }

    syncingRef.current = true
    _syncLocked = true
    clearTimeout(dismissRef.current)
    setSyncState({ syncing: true })
    /* Taken now: what is written from here on is the next push's. Handed back
       if this one does not finish. */
    const sent = new Set(dirty.current)
    dirty.current.clear()

    if (!silent) {
      setStatus('syncing')
      setErrMsg('')
    }

    try {
      if (light) {
        const { data, error: sessionErr } = await supabase.auth.getSession()
        if (sessionErr || !data.session) throw new Error(`Session expired: ${sessionErr?.message ?? 'signed out'}`)
      } else {
        // Refresh the session first — iOS Safari PWA can have stale tokens
        const { error: sessionErr } = await supabase.auth.refreshSession()
        if (sessionErr) throw new Error(`Session expired: ${sessionErr.message}`)
      }

      const { added, first } = await fullSync(user.id, { choice, quick: changes, only: changes ? sent : null })
      await db.meta.put({ key: 'lastSync', value: new Date().toISOString() })
      syncedFor.current = user.id
      setSyncState({ syncing: false, caughtUp: true })
      setFirstSync(null)
      /* What another device added, said once it is here. Not for a device's
         first sync with an account: that is the whole ledger arriving, which
         is not news. */
      if (!first) announce(added)

      if (!silent) {
        setStatus('success')
        dismissRef.current = setTimeout(() => setStatus('idle'), 3000)
      }
      return true
    } catch (err) {
      for (const table of sent) dirty.current.add(table)
      /* Not a failure: nothing was sent or changed, and nothing will be until
         the sheet is answered. caughtUp stays false meanwhile, so the readers
         that wait for it - the reminder upload - wait for the answer too. */
      if (err instanceof FirstSyncChoiceNeeded) {
        setFirstSync(err.info)
        setStatus('idle')
        return false
      }
      if (auto) {
        // Offline, or the cloud is having a moment: the next change tries again.
        console.warn('[SyncManager] background sync did not finish:', err?.message ?? err)
        return false
      }
      console.error('[SyncManager]', err)
      const msg = err?.message ?? String(err)
      setErrMsg(msg)
      setStatus('error')
      dismissRef.current = setTimeout(() => setStatus('idle'), 8000)
      return false
    } finally {
      syncingRef.current = false
      _syncLocked = false
      setSyncState({ syncing: false })
      followUpRef.current()
    }
  }, [user?.id, announce])

  /**
   * Pull what another device did, and push nothing (lib/sync.js pullChanges
   * says why). Waits its turn behind a sync that is running, and runs once it
   * has ended.
   */
  const runPull = useCallback(async () => {
    if (!user?.id) return false
    if (syncingRef.current || _syncLocked) { followUp.current.pull = true; return false }
    // Nothing is pulled into a ledger that has not had its first sync, or been asked about it.
    if (syncedFor.current !== user.id) return false

    syncingRef.current = true
    _syncLocked = true
    // The tables asked about since the last pull; handed back if this one does not finish.
    const asked = pullTables.current
    pullTables.current = new Set()
    const only = asked.has('*') ? null : asked
    try {
      const { data, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr || !data.session) throw new Error(`Session expired: ${sessionErr?.message ?? 'signed out'}`)
      // Said as soon as the ledger is in, not when the last table is.
      await pullChanges(user.id, { onAdded: announce, only })
      return true
    } catch (err) {
      for (const table of asked) pullTables.current.add(table)
      console.warn('[SyncManager] live pull did not finish:', err?.message ?? err)
      return false
    } finally {
      syncingRef.current = false
      _syncLocked = false
      followUpRef.current()
    }
  }, [user?.id, announce])

  /* What was waiting, once nothing is running. A push is checked for too:
     a transaction saved while the sync was on its way up was written after
     it had looked, and is still marked unsent. So is a row of any other table
     that is - and that is the case this exists for: a pull writes into the
     very tables a person is using, and the watcher of local changes hears
     nothing while it does (it must not, or a pull would start a push), so a
     save made in that moment is marked unsent and nobody asked for it to be
     sent. Whatever is found goes up as a push of those tables, which reads
     them first, as every push of a table does. Twice at most, so a row that
     cannot be sent cannot loop. */
  useEffect(() => {
    followUpRef.current = () => {
      const f = followUp.current
      // What was heard before this session's first sync had finished goes in now, and at once: somebody is waiting for it.
      if (heardRows.current.size) setTimeout(() => drainRef.current(), 0)
      setTimeout(async () => {
        if (!user?.id || syncingRef.current || _syncLocked) return
        if (f.push) { f.push = false; runSync({ silent: true, light: true, auto: true, changes: true }); return }
        if (f.pull) { f.pull = false; runPull(); return }
        if (syncedFor.current === user.id && f.rechecks < 2) {
          // A look that fails is no reason to push: the next sync's end looks again.
          const tables = await unsentTables(user.id).catch(() => /** @type {Set<string>} */ (new Set()))
          const left = tables.size > 0 || (await getUnsyncedTxs()).some(t => t.txId)
          if (left) {
            for (const table of tables) dirty.current.add(table)
            f.rechecks += 1
            runSync({ silent: true, light: true, auto: true, changes: true })
          } else f.rechecks = 0
        }
      }, 400)
    }
  })

  /* A change made here goes up shortly after, not on the next time the
     window comes forward: the pause is for a burst of saves to be one push. */
  const schedulePush = useCallback(() => {
    if (!user?.id || syncedFor.current !== user.id) return
    if (timers.current.push) clearTimeout(timers.current.push)
    timers.current.push = setTimeout(() => {
      timers.current.push = null
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      runSync({ silent: true, light: true, auto: true, changes: true })
    }, PUSH_WAIT)
  }, [user?.id, runSync])

  /* A change made elsewhere is read soon after it is heard - the table it was
     in, and whichever others were heard in the same moment, which is how a
     push that touches many rows becomes one pull. `*` for any table. */
  const schedulePull = useCallback((table = '*') => {
    pullTables.current.add(table)
    if (timers.current.pull) return
    timers.current.pull = setTimeout(() => {
      timers.current.pull = null
      runPull()
    }, PULL_WAIT)
  }, [runPull])

  /* A transaction another device has just saved - told to this one directly
     (lib/liveShare.js) or announced by the database - goes into the ledger from
     the message itself, with no trip back to the cloud: what makes it show up
     the moment it is saved.

     It does not wait for a sync. Adding it is one transaction on its own that
     checks for the row first (applyRemoteTransaction), and a sync that is
     reading the same rows checks again as it writes (sync.js pullTxs), so the
     two cannot both add one however they overlap. What is heard while one is
     being applied waits for it and goes in together, with one toast. Anything
     that cannot be settled from the message alone, a pull does. */
  const drainHeard = useCallback(async () => {
    // Before the first sync of this session the ledger is not this account's yet: wait for it (followUpRef).
    if (draining.current || !user?.id || syncedFor.current !== user.id) return
    draining.current = true
    try {
      while (heardRows.current.size) {
        const rows = [...heardRows.current.values()]
        heardRows.current.clear()
        /** @type {Array<Record<string, any>>} */
        const added = []
        for (const row of rows) {
          try {
            const result = await applyRemoteTransaction(row)
            if (!result.handled) schedulePull('transactions')
            else if (result.added) added.push(result.added)
          } catch (err) {
            console.warn('[SyncManager] a live change did not apply:', err?.message ?? err)
            schedulePull('transactions')
          }
        }
        if (added.length) announce(added)
      }
    } finally {
      draining.current = false
    }
  }, [user?.id, announce, schedulePull])
  useEffect(() => { drainRef.current = drainHeard })

  const applyHeard = useCallback((/** @type {Record<string, any>} */ row) => {
    heardRows.current.set(row.tx_id, row)
    drainHeard()
  }, [drainHeard])

  /** What the stream says: a new or changed transaction goes straight in; anything else is a table to read. */
  const heard = useCallback((/** @type {string} */ table, /** @type {import('../lib/realtime').ChangeEvent} */ event) => {
    const row = event?.new
    if (table === 'transactions' && event?.eventType !== 'DELETE' && row?.tx_id) applyHeard(row)
    else schedulePull(table)
  }, [applyHeard, schedulePull])

  /** @param {import('../lib/sync').FirstSyncChoice} choice */
  async function choose(choice) {
    setChoosing(choice)
    // Not silent: the chip is the only word on whether it worked.
    await runSync({ choice })
    setChoosing(null)
  }

  /* The way out that changes nothing, for the wrong Google account. The
     sheet goes with the user: it only opens for someone signed in. */
  async function leave() {
    try {
      await signOut()
    } finally {
      setFirstSync(null)
    }
  }

  /* Sync on mount / user change (silent - no chip shown unless error).

     Both disables are the same decision. The effect must fire when the USER
     changes and at no other time; runSync is redeclared every render, so
     listing it would sync on every render instead. preserve-manual-memoization
     preserve-manual-memoization objected to the same thing and is now off
     in eslint.config.js - see the note there. */
  useEffect(() => {
    // Fires a network round-trip when the signed-in user changes, and
    // runSync reports its progress through state. An effect is the
    // correct place for it; the state is a consequence, not the point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.id) runSync({ silent: true })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync on window focus, but at most once per 60 s (prevents firing on every tap/click in some browsers)
  useEffect(() => {
    let lastFocusSync = 0
    const onFocus = () => {
      if (!user?.id) return
      const now = Date.now()
      if (now - lastFocusSync < 60_000) return
      lastFocusSync = now
      runSync({ silent: true })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user?.id, runSync])

  /* Coming back to the tab or the installed app, and the network returning,
     are both moments something may have been missed: the stream does not
     queue what it sent while this device was asleep. */
  useEffect(() => {
    if (!user?.id) return
    const onVisible = () => { if (document.visibilityState === 'visible') schedulePull('*') }
    const onOnline = () => runSync({ silent: true, light: true, auto: true })
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [user?.id, schedulePull, runSync])

  // Listen for what other devices do.
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return
    return startRealtime(user.id, { onChange: heard, onState: setLive })
  }, [user?.id, heard])

  /* Tell the other devices of a transaction saved here, directly, the moment
     it is committed: the push below follows, but the database is a longer way
     round. Whatever is read back is the row as it was saved. */
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return
    const userId = user.id
    const channel = startShare(userId, { onTransaction: row => heard('transactions', { eventType: 'BROADCAST', new: row }) })
    sharing.current = channel
    const waiting = heardRows.current
    return () => { sharing.current = null; waiting.clear(); channel.stop() }
  }, [user?.id, heard])

  // And push what this one does, as it happens.
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return
    const userId = user.id
    // One message per transaction however many times it was written in the same save.
    const queued = new Set()
    const tell = (/** @type {any} */ key) => {
      if (queued.has(key)) return
      queued.add(key)
      setTimeout(async () => {
        queued.delete(key)
        try {
          const tx = await db.transactions.get(key)
          if (tx?.txId) sharing.current?.share(toShareRow(tx, userId))
        } catch { /* a head start, nothing more */ }
      }, 0)
    }
    return watchLocalChanges(table => { dirty.current.add(table); schedulePush() }, tell)
  }, [user?.id, schedulePush])

  /* If the stream is not there - the database has not been told to publish
     its changes (migration 030), or there is no connection - ask now and then
     instead, while the window is in front. */
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured || live === 'on') return
    const id = setInterval(() => { if (document.visibilityState === 'visible') schedulePull('*') }, 45_000)
    return () => clearInterval(id)
  }, [user?.id, live, schedulePull])

  // Cleanup on unmount
  useEffect(() => () => {
    clearTimeout(dismissRef.current)
    if (timers.current.pull) clearTimeout(timers.current.pull)
    if (timers.current.push) clearTimeout(timers.current.push)
  }, [])

  return (
    <SyncContext.Provider value={{ status, runSync, live }}>
      <SyncIndicator status={status} errMsg={errMsg} />
      {/* Push reminders need the server, so they need a user. */}
      {user?.id && isSupabaseConfigured && <ReminderSync userId={user.id} />}
      {/* The notifications list is worked out on the device and needs neither. */}
      <NotificationSync />
      <Outlet />
      <FirstSyncSheet info={user?.id ? firstSync : null} busy={choosing} onChoose={choose} onSignOut={leave} />
    </SyncContext.Provider>
  )
}
