import pg from 'npm:pg@8.22.0';
import {createAccountAuthRuntime} from '../_shared/accountAuthRuntime.mjs';

const required=(name:string)=>{const value=Deno.env.get(name)?.trim();if(!value)throw new Error(`Missing ${name}`);return value;};
const decodeSecret=(value:string)=>{
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid temporary pepper');
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=');
  const bytes=Uint8Array.from(atob(normalized),character=>character.charCodeAt(0));
  if(bytes.byteLength<32||bytes.byteLength>128)throw new Error('Invalid temporary pepper');return bytes;
};
const origins=()=>required('ACCOUNT_ALLOWED_ORIGINS').split(',').map(value=>value.trim()).filter(Boolean).map(value=>{
  const url=new URL(value);if(url.href!==value+'/'&&url.href!==value||url.pathname!=='/'||url.search||url.hash||
    (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Invalid allowed origin');
  return url.origin;
});

let runtimePromise:ReturnType<typeof createAccountAuthRuntime>|null=null;
const remoteAddresses=new WeakMap<Request,string>();
const runtime=()=>runtimePromise??=(async()=>{
  if(required('ACCOUNT_AUTH_READY')!=='true')throw new Error('Account auth is not enabled');
  // Supabase injects SUPABASE_DB_URL for deployed functions. A separately
  // managed URL is optional, but must never be required just to duplicate the
  // platform-provided server secret.
  const databaseUrl=Deno.env.get('ACCOUNT_DATABASE_URL')?.trim()||required('SUPABASE_DB_URL');
  const pool=new pg.Pool({connectionString:databaseUrl,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:5000,
    application_name:'account-auth'});
  let readyUntil=0;
  const readiness=async()=>{
    if(Date.now()<readyUntil)return true;
    const {rows}=await pool.query(`SELECT to_regclass('account_security.accounts') IS NOT NULL
      AND to_regclass('account_security.session_assurances') IS NOT NULL
      AND to_regclass('account_security.login_identifiers') IS NOT NULL
      AND to_regclass('account_security.legacy_credentials') IS NOT NULL
      AND to_regclass('account_security.credential_operations') IS NOT NULL
      AND to_regclass('account_security.credential_confirmations') IS NOT NULL
      AND to_regclass('account_security.registration_operations') IS NOT NULL
      AND to_regclass('account_security.membership_receipts') IS NOT NULL
      AND to_regclass('account_security.account_roles') IS NOT NULL
      AND to_regclass('account_security.guest_link_reviews') IS NOT NULL
      AND to_regclass('account_security.account_merge_receipts') IS NOT NULL
      AND to_regrole('account_member_admin_worker') IS NOT NULL
      AND to_regrole('account_merge_worker') IS NOT NULL AS ready`);
    if(rows[0]?.ready===true)readyUntil=Date.now()+5000;return rows[0]?.ready===true;
  };
  return createAccountAuthRuntime({basePool:pool,supabaseUrl:required('SUPABASE_URL'),
    publishableKey:required('SUPABASE_ANON_KEY'),serviceRoleKey:required('SUPABASE_SERVICE_ROLE_KEY'),
    lookupSecret:required('ACCOUNT_LOOKUP_SECRET'),legacyBridgeSecret:required('ACCOUNT_LEGACY_BRIDGE_SECRET'),pepper:decodeSecret(required('ACCOUNT_TEMPORARY_PEPPER')),
    resolveClientKey:async(request:Request)=>{
      const value=remoteAddresses.get(request);
      if(!value)throw new Error('Trusted client address unavailable');return value;
    // Supabase's edge gateway mounts the function request at /account-auth;
    // /functions/v1 is the public gateway prefix and is not present in the
    // URL observed by the function runtime.
    },readiness,allowedOrigins:origins(),basePath:Deno.env.get('ACCOUNT_AUTH_BASE_PATH')?.trim()||'/account-auth',
    temporaryTtlMs:86400000,confirmationTtlMs:300000,assuranceTtlMs:86400000,
    passwordPolicy:async(value:string)=>value.length>=6&&value.length<=128,
    termsVersion:required('ACCOUNT_TERMS_VERSION'),loginDomain:required('ACCOUNT_LOGIN_DOMAIN')});
})();

Deno.serve(async(request,info)=>{
  try{
    remoteAddresses.set(request,info.remoteAddr.hostname);
    return await (await runtime())(request);
  }catch{return Response.json({error:'temporarily_unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
});
