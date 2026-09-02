import assert from 'node:assert/strict';
import {createCredentialResetStore} from '../supabase/functions/_shared/credentialResetStore.mjs';

const ids={confirmationId:crypto.randomUUID(),profileId:crypto.randomUUID(),actorProfileId:crypto.randomUUID(),authUserId:crypto.randomUUID()};
let row={id:ids.confirmationId,profileId:ids.profileId,actorProfileId:ids.actorProfileId,purpose:'password_reset',validUntil:2000,
    authUserId:ids.authUserId,credentialVersion:3,phone:'010-1234-0123',phoneBack4:'9999'};
const load=createCredentialResetStore(async(sql,values)=>{assert.ok(sql.includes('c.id=$1')&&sql.includes('c.profile_id=$2')&&sql.includes('c.actor_profile_id=$3'));
    assert.deepEqual(values,[ids.confirmationId,ids.profileId,ids.actorProfileId]);return {rows:row?[row]:[]};});
let result=await load(ids);assert.equal(result.phoneLast4,'0123');assert.equal(result.account.authUserId,ids.authUserId);
row={...row,phone:null,phoneBack4:'0042'};result=await load(ids);assert.equal(result.phoneLast4,'0042');
row={...row,phone:null,phoneBack4:'bad'};assert.equal(await load(ids),null);
row=null;assert.equal(await load(ids),null);
assert.throws(()=>createCredentialResetStore(null));
console.log('PASS reset confirmation store: parameterized exact binding, current account and server phone last-four only');
