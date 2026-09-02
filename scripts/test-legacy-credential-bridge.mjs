import assert from 'node:assert/strict';
import {createLegacyCredentialBridge} from '../supabase/functions/_shared/legacyCredentialBridge.mjs';
import {createLoginService} from '../supabase/functions/_shared/loginService.mjs';

const bridge=await createLegacyCredentialBridge('fixture-legacy-bridge-secret-12345678901234567890');
const profileId=crypto.randomUUID(),authUserId=crypto.randomUUID(),sessionId=crypto.randomUUID();
const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('1234'))),b=>b.toString(16).padStart(2,'0')).join('');
assert.equal(await bridge.verify('1234',digest),true);assert.equal(await bridge.verify('4321',digest),false);
const providerPassword=await bridge.providerPassword(profileId,digest);assert.match(providerPassword,/^L1_[A-Za-z0-9_-]{43}$/);
assert.equal(await bridge.providerPassword(profileId,digest),providerPassword);assert.notEqual(await bridge.providerPassword(crypto.randomUUID(),digest),providerPassword);

let signedPassword,assured;
const account={profileId,authUserId,mappingVerified:true,status:'active',credentialVersion:1,mustChangePassword:false,
    loginEmail:'legacy@example.invalid',credentialMode:'legacy_bridge',enabled:true,legacyDigest:digest};
const login=createLoginService({legacyBridge:bridge,assuranceTtlMs:3600000,readiness:async()=>true,keyFor:async(k,v)=>k+':'+v,
    store:{consumeLimit:async()=>true,findByProfile:async()=>[account],findByLookup:async()=>[account],grantAssurance:async expected=>{assured=expected;}},
    gateway:{signIn:async(email,password)=>{signedPassword=password;return {access_token:'access',refresh_token:'refresh',user:{id:authUserId}};},discardCreatedSession:async()=>{}},
    verifyToken:async()=>({authUserId,sessionId,live:true,isAnonymous:false,expiresAt:Date.now()+3600000})});
const result=await login({action:'login',protocol:1,profileId,password:'1234'},{clientKey:'trusted'});
assert.equal(result.profileId,profileId);assert.equal(signedPassword,providerPassword);assert.equal(assured.credentialMode,'legacy_bridge');
await assert.rejects(()=>login({action:'login',protocol:1,profileId,password:'9999'},{clientKey:'trusted'}),e=>e.code==='invalid_login');
let attempts=[];const pendingAccount={...account,credentialMode:'legacy_pending'};
// Use the real error class boundary for the first uncertain migration phase.
const {LoginError}=await import('../supabase/functions/_shared/loginSecurity.mjs');
attempts=[];pendingAccount.credentialMode='legacy_pending';
const pendingWithTypedFailure=createLoginService({legacyBridge:bridge,assuranceTtlMs:3600000,readiness:async()=>true,keyFor:async(k,v)=>k+':'+v,
    store:{consumeLimit:async()=>true,findByProfile:async()=>[pendingAccount],findByLookup:async()=>[pendingAccount],grantAssurance:async()=>{}},
    gateway:{signIn:async(email,value)=>{attempts.push(value);if(value!==providerPassword)throw new LoginError('invalid_login',401);
        return {access_token:'access',refresh_token:'refresh',user:{id:authUserId}};},discardCreatedSession:async()=>{}},
    verifyToken:async()=>({authUserId,sessionId,live:true,isAnonymous:false,expiresAt:Date.now()+3600000})});
await pendingWithTypedFailure({action:'login',protocol:1,profileId,password:'1234'},{clientKey:'trusted'});
assert.deepEqual(attempts,[digest,'1234',providerPassword]);
console.log('PASS legacy credential bridge: existing four-character login, keyed provider credential, wrong password denial and assurance');
