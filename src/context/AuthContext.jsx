import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { rememberDeveloper } from '../lib/developer'
import { dropStaleCaches } from '../lib/staleCaches'

const AuthContext = createContext(null)

/** @param {{children: import('react').ReactNode}} props */
export function AuthProvider({ children }) {
  // undefined = still loading, null = not signed in, object = signed in
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Hydrate with the current session (handles OAuth redirect tokens in URL)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    // Keep session in sync with Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // A device signed in as the developer is the developer's from then on (lib/developer.js).
  useEffect(() => { rememberDeveloper(session?.user?.email) }, [session])

  /**
   * @param {{reauthenticate?: boolean}} [opts]  `reauthenticate`: make Google
   *   ask for the password again, not just pick the account it remembers. For
   *   the App lock's "Forgot? Sign in again", which turns the lock off - an
   *   account Google keeps signed in on the phone would otherwise be one tap
   *   from anybody holding it.
   */
  function signInWithGoogle({ reauthenticate = false } = {}) {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        ...(reauthenticate ? { queryParams: { prompt: 'login' } } : {}),
      },
    })
  }

  async function signOut() {
    /* A device that signs out stops getting this person's reminders - its
       push address is theirs until it is removed, and nothing else would
       remove it. Best-effort and bounded: signing out must work offline, so
       a slow or failed cleanup never holds it up. Imported on demand to keep
       the push code off the start-up path. */
    const uid = session?.user?.id
    if (uid) {
      try {
        const push = await import('../lib/push')
        if (await push.remindersOn()) {
          await Promise.race([
            push.disableReminders(uid),
            new Promise(resolve => setTimeout(resolve, 4000)),
          ])
        }
      } catch (e) {
        console.warn('[auth] could not turn reminders off before signing out:', e?.message ?? e)
      }
    }
    // A copy of the cloud an old service worker kept goes with the session (lib/staleCaches.js).
    await dropStaleCaches()
    return supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <AuthContext.Provider value={{
      session,
      loading: session === undefined,
      user:    session?.user ?? null,
      signInWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
