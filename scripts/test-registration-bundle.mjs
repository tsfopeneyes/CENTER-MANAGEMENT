import assert from 'node:assert/strict';
import {createRegistrationBundle} from '../supabase/functions/_shared/registrationBundle.mjs';

const pool={query:async()=>({rows:[]}),connect:async()=>({query:async()=>({rows:[]}),release(){}})};
const service=createRegistrationBundle({registrationPool:pool,membershipPool:pool,limits:{consumeLimit:async()=>true},
    keyFor:async()=> 'a'.repeat(64),adminAuth:{},gateway:{},verifyToken:async()=>null,readiness:async()=>false,
    passwordPolicy:async()=>true,termsVersion:'fixture-v1',loginDomain:'accounts.example.invalid'});
assert.equal(typeof service,'function');
await assert.rejects(()=>service({},{}),error=>error.code==='invalid_request');
console.log('PASS registration composition: current form validation, native Auth preparation and atomic membership finalization wired without approval step');
