import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

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

  function signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  { redirectTo: window.location.origin },
    })
  }

  function signOut() {
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
