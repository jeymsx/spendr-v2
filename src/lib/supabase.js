import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL  ?? ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** False when the env vars are missing — sync and auth can't work. */
export const isSupabaseConfigured = Boolean(url && key)

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set. ' +
    'Sync and sign-in are unavailable; the app runs offline-only against IndexedDB.',
  )
}

// createClient throws outright on an empty URL, and this module sits on
// main.jsx's import path via AuthContext. An unset env var therefore used to
// take the entire app down to a blank screen instead of just disabling sync —
// the opposite of the offline-first behaviour the warning above promises.
//
// The placeholder keeps construction valid. getSession() reads from
// localStorage and resolves to null without touching the network, so the app
// mounts and every local feature works; only requests that genuinely need a
// backend fail, and those are already gated behind a signed-in user.
export const supabase = createClient(
  url || 'http://localhost/unconfigured',
  key || 'unconfigured',
)
