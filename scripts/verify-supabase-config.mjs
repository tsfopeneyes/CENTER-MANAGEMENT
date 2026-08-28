const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !anonKey) {
  throw new Error('Supabase build configuration is incomplete. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

let endpoint;
try {
  endpoint = new URL(supabaseUrl);
} catch {
  throw new Error('VITE_SUPABASE_URL is not a valid URL.');
}

if (!endpoint.hostname.endsWith('.supabase.co')) {
  throw new Error('VITE_SUPABASE_URL must point to a Supabase project.');
}

const response = await fetch(`${endpoint.origin}/rest/v1/users?select=id&limit=1`, {
  headers: {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  },
});

if (!response.ok) {
  throw new Error(`Supabase credentials were rejected during build verification (HTTP ${response.status}).`);
}

console.log(`Supabase configuration verified for ${endpoint.hostname}.`);
