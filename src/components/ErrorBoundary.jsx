import { Component } from 'react'
import Button from './ui/Button'
import { crashReport, readCrashes, recordCrash } from '../lib/crashLog'
import { shareOrCopy } from '../lib/share'
import { version as APP_VERSION } from '../../package.json'

/**
 * Catches render-time errors so one failure doesn't blank the whole app.
 *
 * This matters more here than in most apps: useLiveQuery rethrows any Dexie
 * error during render (hooks/useLiveQuery.js), so a single malformed record or
 * a failed IndexedDB read would otherwise take out everything.
 *
 * `resetKeys` — when any value in the array changes, the boundary clears itself.
 * AppLayout passes the pathname so navigating away from a broken page recovers
 * instead of leaving the fallback stuck in place.
 *
 * ── It records what it catches ──
 *
 * It used to log to the console and nowhere else, which on a phone means
 * nowhere at all: nobody reads the console of a home-screen app. Now each one
 * goes to the on-device log (lib/crashLog.js), and the screen offers to share
 * it - the only way a crash on somebody else's phone ever reaches the person
 * who can fix it. It stays on the device unless they tap.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, shared: '' }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
    recordCrash(error, 'render', { version: APP_VERSION, extra: info?.componentStack ?? '' })
  }

  share = async () => {
    const outcome = await shareOrCopy('Spendr error report', crashReport(readCrashes()))
    this.setState({ shared: outcome === 'copied' ? 'Copied' : outcome === 'shared' ? 'Sent' : '' })
  }

  componentDidUpdate(prevProps) {
    const prev = prevProps.resetKeys
    const next = this.props.resetKeys
    if (!this.state.error || !prev || !next) return
    if (prev.length !== next.length || prev.some((k, i) => k !== next[i])) {
      this.setState({ error: null, shared: '' })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center px-8 text-center"
        style={{ minHeight: this.props.compact ? '60dvh' : '100dvh' }}
      >
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4
          bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="text-red-500 dark:text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <p className="text-base font-semibold text-slate-800 dark:text-white">
          Something went wrong
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-[280px]">
          Your data is safe. It's stored on this device and nothing was lost.
        </p>

        <p className="mt-3 max-w-[280px] px-3 py-2 rounded-xl text-11 font-mono break-words
          bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400"
        >
          {error?.message ?? String(error)}
        </p>

        <div className="flex items-center gap-2 mt-5">
          <Button
            variant="outline"
            size="sm"
            className="px-4"
            onClick={() => this.setState({ error: null, shared: '' })}
          >
            Try again
          </Button>
          <Button size="sm" className="px-4" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>

        {/* Quiet, and under the two actions that actually fix things: this is
            for somebody who is going to send it to whoever built the app, and
            most people just want the Reload button. */}
        <button
          type="button"
          onClick={this.share}
          className="mt-4 text-xs font-medium text-slate-500 dark:text-slate-400 underline
            underline-offset-2 active:opacity-60"
        >
          {this.state.shared || 'Send error details'}
        </button>
      </div>
    )
  }
}
