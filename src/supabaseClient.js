import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        // Interest registration and the rest of the signed-in experience must
        // survive refreshes and deployments without asking the member again.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
})
