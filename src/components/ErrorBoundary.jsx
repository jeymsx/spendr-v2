import { Component } from 'react'

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
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  componentDidUpdate(prevProps) {
    const prev = prevProps.resetKeys
    const next = this.props.resetKeys
    if (!this.state.error || !prev || !next) return
    if (prev.length !== next.length || prev.some((k, i) => k !== next[i])) {
      this.setState({ error: null })
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
          Your data is safe — it's stored on this device and nothing was lost.
        </p>

        <p className="mt-3 max-w-[280px] px-3 py-2 rounded-xl text-[11px] font-mono break-words
          bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400"
        >
          {error?.message ?? String(error)}
        </p>

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2.5 rounded-2xl text-xs font-semibold
              bg-white dark:bg-white/[0.07] text-slate-700 dark:text-slate-200
              border border-slate-200/80 dark:border-white/[0.09]
              active:scale-95 transition-transform duration-75"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-white bg-primary
              active:scale-95 transition-transform duration-75"
          >
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
