import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const { session, loading, signInWithGoogle } = useAuth()
  const [signingIn, setSigningIn] = useState(false)
  const [error,     setError]     = useState(null)

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!loading && session) {
      navigate('/', { replace: true })
    }
  }, [session, loading, navigate])

  async function handleGoogleSignIn() {
    setError(null)
    setSigningIn(true)
    try {
      const { error } = await signInWithGoogle()
      if (error) throw error
      // Supabase redirects to Google; onAuthStateChange handles the rest
    } catch (e) {
      console.error('[Login]', e)
      setError(e.message ?? 'Sign-in failed. Please try again.')
      setSigningIn(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0d1117]">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6
      bg-slate-50 dark:bg-[#0d1117] relative overflow-hidden">

      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -left-24 w-96 h-96 rounded-full opacity-[0.15] dark:opacity-[0.20]"
          style={{ background: 'radial-gradient(circle, var(--color-primary) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 -right-16 w-80 h-80 rounded-full opacity-[0.10] dark:opacity-[0.15]"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="w-[72px] h-[72px] rounded-[22px] bg-primary flex items-center justify-center mb-5
              shadow-[0_12px_40px_rgba(var(--color-primary-rgb),0.50)]"
          >
            <span className="text-white text-[34px] font-semibold tracking-tighter leading-none">S</span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white">
            Spendr
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1.5 text-center">
            Your finances, beautifully tracked.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-white/[0.04] rounded-3xl
          border border-slate-100 dark:border-white/[0.07]
          shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-none
          p-6 mb-4">

          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 text-center mb-5">
            Sign in to continue
          </p>

          <button
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3
              py-3.5 rounded-2xl text-sm font-semibold
              bg-primary text-white
              shadow-[0_4px_20px_rgba(var(--color-primary-rgb),0.40)]
              disabled:opacity-50 disabled:shadow-none
              active:scale-[0.98] transition-all duration-100"
          >
            {signingIn ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <GoogleIcon />
                Sign in with Google
              </>
            )}
          </button>

          {error && (
            <p className="mt-3 text-xs text-center text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 px-4">
          By signing in you agree to sync your data securely with Supabase.
        </p>

        <button
          onClick={() => navigate(-1)}
          className="mt-5 w-full text-center text-sm text-slate-400 dark:text-slate-500
            active:text-slate-600 dark:active:text-slate-300 transition-colors"
        >
          Continue without signing in →
        </button>
      </div>
    </div>
  )
}
