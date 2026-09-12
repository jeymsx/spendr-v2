import { IconTick } from '../../components/icons'
import { CURRENCIES } from './shared'

// ── Sub-components ─────────────────────────────────────────────────────────────

export function StepDots({ current, total }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? 'w-6 h-2 bg-primary'
              : i < current
              ? 'w-2 h-2 bg-primary/40'
              : 'w-2 h-2 bg-white/20'
          }`}
        />
      ))}
    </div>
  )
}

export function SpendrLogo({ size = 64 }) {
  return (
    <img
      src="/icons/icon-512.png"
      alt="Spendr"
      style={{ width: size, height: size }}
    />
  )
}

// ── Step 0: Welcome ────────────────────────────────────────────────────────────

export function StepWelcome({ onNext, onSignIn, signingIn }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      <SpendrLogo size={72} />

      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-white">Welcome to Spendr</h1>
        <p className="text-slate-400 mt-2 text-[15px]">Your finances, beautifully tracked.</p>
      </div>

      <div className="flex flex-col items-center gap-2.5 text-sm text-slate-500 mt-2">
        {['Track spending & income', 'Manage multiple accounts', 'Sync across devices'].map(f => (
          <div key={f} className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center text-primary"><IconTick size={12} /></span>
            <span>{f}</span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3 mt-2">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
             active:scale-[0.98] transition-all duration-100"
        >
          Get started →
        </button>
        <button
          onClick={onSignIn}
          disabled={signingIn}
          className="w-full py-3.5 rounded-full text-sm font-semibold text-slate-300
            border border-white/[0.12] bg-white/[0.05]
            flex items-center justify-center gap-2.5
            active:bg-white/[0.10] transition-all duration-100 disabled:opacity-50"
        >
          {signingIn ? (
            <span className="w-4 h-4 border-2 border-slate-400/40 border-t-slate-300 rounded-full animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          {signingIn ? 'Signing in…' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

// ── Step 1: Name ───────────────────────────────────────────────────────────────

export function StepName({ value, onChange, onNext }) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <div>
        <p className="text-primary text-xs font-bold mb-3">Step 1 of 6</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          What should<br />we call you?
        </h2>
        <p className="text-slate-500 mt-2 text-sm">A first name or nickname works great.</p>
      </div>

      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && value.trim() && onNext()}
        placeholder="Your name"
        autoFocus
        maxLength={40}
        className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-5 py-4
          text-white text-[17px] placeholder:text-slate-600
          focus:outline-none focus:border-primary/60 focus:bg-white/[0.08]
          transition-colors"
      />

      <div className="mt-auto">
        <button
          onClick={onNext}
          disabled={!value.trim()}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
             active:scale-[0.98] transition-all duration-100
            disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Currency ───────────────────────────────────────────────────────────

export function StepCurrency({ value, onChange, onNext }) {
  return (
    <div className="flex-1 flex flex-col gap-8">
      <div>
        <p className="text-primary text-xs font-bold mb-3">Step 2 of 6</p>
        <h2 className="text-[28px] font-semibold leading-tight text-white">
          Your main<br />currency?
        </h2>
        <p className="text-slate-500 mt-2 text-sm">You can change this later in Settings.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {CURRENCIES.map(({ code, symbol, label }) => (
          <button
            key={code}
            onClick={() => onChange(code)}
            className={`p-4 rounded-2xl border-2 text-left transition-all duration-100 active:scale-[0.97] ${
              value === code
                ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.3)]'
                : 'border-white/[0.08] bg-white/[0.04] active:bg-white/[0.08]'
            }`}
          >
            <div className="text-2xl font-semibold text-white leading-none">{symbol}</div>
            <div className="text-sm font-bold text-white mt-2">{code}</div>
            <div className="text-xs text-slate-400 mt-0.5 leading-tight">{label}</div>
          </button>
        ))}
      </div>

      <div className="mt-auto">
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-[16px]
             active:scale-[0.98] transition-all duration-100"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
