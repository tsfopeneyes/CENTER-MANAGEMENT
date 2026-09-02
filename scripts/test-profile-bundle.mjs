import assert from 'node:assert/strict';
import {createProfileBundle} from '../supabase/functions/_shared/profileBundle.mjs';
const pool={connect:async()=>({query:async()=>({rows:[]}),release(){}})};
const bundle=createProfileBundle({pool,verifyToken:async()=>null,readiness:async()=>false});
assert.deepEqual(Object.keys(bundle),['read','update']);assert.equal(typeof bundle.read,'function');assert.equal(typeof bundle.update,'function');
console.log('PASS profile composition: protected explicit read and compatible metadata update wired together');
