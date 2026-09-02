import assert from 'node:assert/strict';
import {createCredentialResetVerifier} from '../supabase/functions/_shared/credentialResetVerifier.mjs';

const profileId=crypto.randomUUID(),confirmationId=crypto.randomUUID(),actorProfileId=crypto.randomUUID(),authUserId=crypto.randomUUID();
let authorized=true,recordEnabled=true;
const verify=createCredentialResetVerifier({now:()=>1000,
    async authorize(input){assert.equal(input.action,'credentials.reset');assert.equal(input.accessToken,'admin-token');return authorized?{actorProfileId,authUserId:crypto.randomUUID()}:null;},
    async loadConfirmation(input){assert.deepEqual(input,{confirmationId,profileId,actorProfileId});return recordEnabled?{id:confirmationId,profileId,actorProfileId,purpose:'password_reset',validUntil:2000,phoneLast4:'0123',account:{profileId,authUserId,credentialVersion:4}}:null;}
});
const result=await verify({profileId,confirmationId},{accessToken:'admin-token'});assert.equal(result.allowed,true);assert.equal(result.phoneLast4,'0123');
await assert.rejects(()=>verify({profileId,confirmationId},{}),error=>error.code==='forbidden');
authorized=false;await assert.rejects(()=>verify({profileId,confirmationId},{accessToken:'admin-token'}),error=>error.code==='forbidden');authorized=true;
recordEnabled=false;await assert.rejects(()=>verify({profileId,confirmationId},{accessToken:'admin-token'}),error=>error.code==='forbidden');
console.log('PASS reset verifier: live administrator authorization and server confirmation/account/phone only');
