import { createClient } from '@supabase/supabase-js'
import 'expo-sqlite/localStorage/install';

const supabaseUrl: string = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseAnonKey: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'local-development-key'

// The bundled SQLite backend is distinct from a self-hosted Supabase service.
export const isLocalBackend = process.env.EXPO_PUBLIC_LOCAL_MODE === 'true' || (
  process.env.EXPO_PUBLIC_LOCAL_MODE !== 'false' &&
  supabaseAnonKey === 'local-development-key' &&
  /^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(supabaseUrl)
)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
