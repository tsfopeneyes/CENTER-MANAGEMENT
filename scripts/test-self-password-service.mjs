import assert from 'node:assert/strict';
import {createSelfPasswordService} from '../supabase/functions/_shared/selfPasswordService.mjs';

const profileId=crypto.randomUUID(),authUserId=crypto.randomUUID(),actorProfileId=profileId,sessionId=crypto.randomUUID();
const account={profileId,authUserId,credentialVersion:2,loginEmail:'fixture@example.invalid'};
let nativePassword='old-password',reserved=0,completed=0,assurances=0,discarded=0,policy=true,authorized=true,failUpdate=false,failAssurance=false;
const deps={
    store:{async readActive(){return account;},async reserve(input){assert.equal(input.kind,'self_change');reserved++;return {...input,profileId,authUserId,credentialVersion:3};},async complete(){completed++;}},
    limits:{async consumeLimit(){return true;}},keyFor:async()=> 'a'.repeat(64),
    async authorize(){return authorized?{actorProfileId,authUserId,sessionId:crypto.randomUUID()}:null;},
    async passwordPolicy(){return policy;},
    adminAuth:{async updateUserById(id,{password}){assert.equal(id,authUserId);nativePassword=password;if(failUpdate)throw Error('lost response');return {data:{user:{id}},error:null};}},
    gateway:{async signIn(email,password){assert.equal(email,account.loginEmail);assert.equal(password,nativePassword);return {access_token:'new-access',refresh_token:'new-refresh',expires_at:2000,user:{id:authUserId}};}},
    async verifyToken(){return {authUserId,sessionId,live:true,isAnonymous:false,expiresAt:2000000};},
    async grantAssurance(expected,principal){assert.equal(expected.credentialVersion,3);assert.equal(principal.sessionId,sessionId);if(failAssurance)throw Error('assurance failure');assurances++;},
    async discardSession(token){assert.equal(token,'new-access');discarded++;},readiness:async()=>true,assuranceTtlMs:600000,now:()=>1000000
};
const service=createSelfPasswordService(deps),context={accessToken:'current-access',clientKey:'trusted'};
let result=await service({protocol:1,profileId,newPassword:'new-password'},context);
assert.equal(result.status,'session_replaced');assert.equal(result.session.access_token,'new-access');assert.equal(reserved,1);assert.equal(completed,1);assert.equal(assurances,1);assert.equal(discarded,0);
await assert.rejects(()=>service({protocol:1,profileId,newPassword:'12345'},context),error=>error.code==='invalid_request');
policy=false;await assert.rejects(()=>service({protocol:1,profileId,newPassword:'another-password'},context),error=>error.code==='password_policy');policy=true;
authorized=false;await assert.rejects(()=>service({protocol:1,profileId,newPassword:'another-password'},context),error=>error.code==='forbidden');authorized=true;
failUpdate=true;await assert.rejects(()=>service({protocol:1,profileId,newPassword:'ambiguous-password'},context),error=>error.code==='temporarily_unavailable');failUpdate=false;
failAssurance=true;await assert.rejects(()=>service({protocol:1,profileId,newPassword:'third-password'},context),error=>error.code==='temporarily_unavailable');
assert.equal(discarded,1);assert.equal(assurances,1);
console.log('PASS self password change: six-character policy, current authorization, epoch reservation, replacement assurance, failure cleanup');
