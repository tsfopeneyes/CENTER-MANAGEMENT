import assert from 'node:assert/strict';
import {createCredentialBundle} from '../supabase/functions/_shared/credentialBundle.mjs';

const pool={query:async()=>({rows:[]}),connect:async()=>({query:async()=>({rows:[]}),release(){}})};
const bundle=createCredentialBundle({credentialPool:pool,confirmationPool:pool,limits:{consumeLimit:async()=>true},
    keyFor:async()=> 'a'.repeat(64),authorize:async()=>null,adminAuth:{},gateway:{},verifyToken:async()=>null,
    grantAssurance:async()=>{},discardSession:async()=>{},readiness:async()=>false,passwordPolicy:async()=>false,
    pepper:new Uint8Array(32).fill(1),kdfIterations:210000,temporaryTtlMs:600000,confirmationTtlMs:300000,
    assuranceTtlMs:600000});
assert.deepEqual(Object.keys(bundle),['confirmReset','reset','changeTemporary','changeSelf']);
for(const method of Object.values(bundle))assert.equal(typeof method,'function');
assert.throws(()=>createCredentialBundle({credentialPool:pool,confirmationPool:pool,pepper:new Uint8Array(4)}));
console.log('PASS credential composition: confirmation, temporary reset, self change and shared security dependencies wired together');
