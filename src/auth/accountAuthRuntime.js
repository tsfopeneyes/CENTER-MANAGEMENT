import {createAccountAuthClient} from './accountAuthClient.js';
import {supabase} from '../supabaseClient';

// The secure account path is activated only after its database proposals and
// Edge function pass the operational preflight. A configured activation never
// falls back to public credential reads on failure.
export const isAccountAuthEnabled=()=>import.meta.env.VITE_ACCOUNT_AUTH_ENABLED==='true';

let instance;
export function getAccountAuthClient(){
    if(!isAccountAuthEnabled())return null;
    if(instance)return instance;
    const configuredBaseUrl=import.meta.env.VITE_ACCOUNT_AUTH_BASE_URL;
    if(typeof configuredBaseUrl!=='string'||!configuredBaseUrl)throw new Error('Secure account service is not configured');
    instance=createAccountAuthClient({
        baseUrl:configuredBaseUrl,
        supabaseUrl:import.meta.env.VITE_SUPABASE_URL,
        publishableKey:import.meta.env.VITE_SUPABASE_ANON_KEY,
        auth:supabase.auth,
    });
    return instance;
}
