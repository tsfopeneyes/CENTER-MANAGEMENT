// Explicitly approved, fixed-account operational repair. Secrets stay in memory.
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const ref='erecqalsxoxrufggvmcc';
const profileId='a8f7c051-a58b-46ce-9bea-065328dc64d7';
const authId='cdf22c49-c96e-4f64-b808-4397035ff578';
const cli=process.env.JIN_REPAIR_SUPABASE_CLI;
if(!cli || process.argv[2]!=='--approved-jin-only')throw Error('Explicit approval flag and CLI required');
const run=args=>new Promise((resolve,reject)=>{
 const child=spawn(cli,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',part=>output+=part);child.stderr.on('data',()=>{});
 child.on('error',()=>reject(Error('CLI start failed')));
 child.on('close',code=>{if(code!==0)return reject(Error('CLI failed; diagnostics withheld'));try{resolve(JSON.parse(output));}catch{reject(Error('Unexpected CLI response'));}});
});
const query=async sql=>(await run(['db','query','--linked','--project-ref',ref,'--output','json',sql])).rows;
const snapshot=async()=>{
 const rows=await query(`SELECT u.password,u.auth_user_id,a.email,
 md5(to_jsonb(u)::text) AS profile_fingerprint,
 (SELECT md5(coalesce(string_agg(id::text||encrypted_password,',' ORDER BY id),'')) FROM auth.users WHERE id<>'${authId}') AS other_passwords,
 (SELECT count(*) FROM auth.users) AS auth_count,
 (SELECT md5(coalesce(string_agg(to_jsonb(i)::text,',' ORDER BY i.id),'')) FROM public.program_recruitment_interests i WHERE i.auth_user_id='${authId}') AS interests,
 (SELECT md5(coalesce(string_agg(to_jsonb(o)::text,',' ORDER BY o.id),'')) FROM storage.objects o WHERE o.owner_id='${authId}') AS files
 FROM public.users u JOIN auth.users a ON a.id=u.auth_user_id WHERE u.id='${profileId}'`);
 if(rows?.length!==1 || rows[0].auth_user_id!==authId || !/^[a-f0-9]{64}$/.test(rows[0].password||''))throw Error('Fixed account preflight failed');
 return rows[0];
};
let updated=false;
try {
 const before=await snapshot();
 const keys=await run(['projects','api-keys','--project-ref',ref,'--reveal','--output','json']);
 const list=Array.isArray(keys)?keys:keys.api_keys;
 const key=list?.find(k=>k.api_key?.startsWith('sb_secret_'))?.api_key || list?.find(k=>k.name==='service_role')?.api_key;
 if(!key)throw Error('Administrative API key unavailable');
 const admin=createClient(`https://${ref}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data:identity,error:identityError}=await admin.auth.admin.getUserById(authId);
 if(identityError || identity.user?.id!==authId || identity.user.email!==before.email) {
  console.log(JSON.stringify({preflight:true,apiStatus:identityError?.status,apiCode:identityError?.code,identityPresent:!!identity.user,idMatches:identity.user?.id===authId,emailMatches:identity.user?.email===before.email}));
  throw Error('Target identity check failed');
 }
 const {error:updateError}=await admin.auth.admin.updateUserById(authId,{password:before.password});
 if(updateError)throw Error('Password update rejected; no further writes attempted');
 updated=true;
 const publicKey=list?.find(k=>k.type==='publishable')?.api_key || list?.find(k=>k.name==='anon')?.api_key;
 if(!publicKey)throw Error('Public authentication key unavailable after update');
 const client=createClient(`https://${ref}.supabase.co`,publicKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data:login,error:loginError}=await client.auth.signInWithPassword({email:before.email,password:before.password});
 if(loginError || login.user?.id!==authId) {
  console.log(JSON.stringify({loginStatus:loginError?.status,loginCode:loginError?.code,idMatches:login.user?.id===authId}));
  throw Error('Password updated but real authentication verification failed');
 }
 const {error:logoutError}=await client.auth.signOut({scope:'local'});
 if(logoutError)throw Error('Authentication succeeded but test-session cleanup failed');
 const after=await snapshot();
 for(const field of ['password','auth_user_id','email','profile_fingerprint','other_passwords','auth_count','interests','files']) {
  if(before[field]!==after[field])throw Error(`Post-repair preservation check failed: ${field}`);
 }
 console.log(JSON.stringify({repaired:'jin-only',actualPasswordAuthentication:true,testSessionSignedOut:true,profileUnchanged:true,otherAccountPasswordsUnchanged:true,accountCountUnchanged:true,interestsUnchanged:true,filesUnchanged:true}));
} catch(error) {
 console.error(JSON.stringify({updated,error:error.message}));process.exitCode=1;
}
