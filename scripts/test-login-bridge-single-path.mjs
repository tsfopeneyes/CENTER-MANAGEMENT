import assert from 'node:assert/strict';
import {createLoginService} from '../supabase/functions/_shared/loginService.mjs';
import {createLegacyCredentialBridge} from '../supabase/functions/_shared/legacyCredentialBridge.mjs';
import {createLoginKey} from '../supabase/functions/_shared/loginSecurity.mjs';

const profileId='10000000-0000-4000-8000-000000000001';
const authUserId='10000000-0000-4000-8000-000000000002';
const sessionId='10000000-0000-4000-8000-000000000003';
const password='correct legacy password';
const bytes=new TextEncoder().encode(password);
const legacyDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const bridge=await createLegacyCredentialBridge('fixture-bridge-secret-123456789012345678901234');
const derived=await bridge.providerPassword(profileId,legacyDigest);
let signIns=0,assurances=0;
const account={profileId,authUserId,mappingVerified:true,status:'active',credentialVersion:1,
    mustChangePassword:false,loginEmail:'member@example.invalid',credentialMode:'legacy_bridge',enabled:true,legacyDigest};
const service=createLoginService({
    store:{consumeLimit:async()=>true,findByProfile:async()=>[account],grantAssurance:async()=>{assurances++;}},
    gateway:{signIn:async(email,providerPassword)=>{signIns++;assert.equal(email,account.loginEmail);
        assert.equal(providerPassword,derived);return {access_token:'token',refresh_token:'refresh',user:{id:authUserId}};
    },discardCreatedSession:async()=>{}},
    verifyToken:async()=>({authUserId,sessionId,live:true,isAnonymous:false,expiresAt:Date.now()+3600000}),
    keyFor:await createLoginKey('fixture-bridge-lookup-secret-12345678901234567890'),legacyBridge:bridge,
    readiness:async()=>true,assuranceTtlMs:86400000,
});
const result=await service({action:'login',protocol:1,profileId,password},{clientKey:'fixture-client'});
assert.equal(result.profileId,profileId);
assert.equal(signIns,1,'a migrated account must use exactly one provider sign-in');
assert.equal(assurances,1);
console.log('PASS login bridge single path: one verified password maps to one canonical provider sign-in.');
