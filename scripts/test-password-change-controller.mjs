import assert from 'node:assert/strict';
import {createPasswordChangeController} from '../src/auth/passwordChangeController.js';

const profileId=crypto.randomUUID(),authUserId=crypto.randomUUID(),sessionId=crypto.randomUUID();
let session={access_token:'old-access',refresh_token:'old-refresh',user:{id:authUserId}},changes=0,sets=0,failChange=false;
const controller=createPasswordChangeController({now:()=>1000000,exclusive:async work=>work(),
    auth:{async getSession(){return {data:{session}};},async setSession(tokens){sets++;session={...tokens,user:{id:authUserId}};return {data:{session,user:{id:authUserId}}};}},
    async change(input,options){assert.equal(input.action,'change-self');assert.equal(options.accessToken,'old-access');changes++;if(failChange)throw Error('network');
        return {protocol:1,status:'session_replaced',profileId,authUserId,session:{access_token:'new-access',refresh_token:'new-refresh',expires_at:2000}};},
    async resolveSession(accessToken){assert.equal(accessToken,'new-access');return {protocol:1,decision:'retain',profileId,authUserId,sessionId,validUntil:2000000};}
});
assert.deepEqual(await controller({profileId,newPassword:'123456'}),{status:'saved',profileId});assert.equal(sets,1);assert.equal(session.access_token,'new-access');
session={access_token:'old-access',refresh_token:'old-refresh',user:{id:authUserId}};failChange=true;
await assert.rejects(()=>controller({profileId,newPassword:'another-password'}));assert.equal(session.access_token,'old-access');assert.equal(sets,1);
await assert.rejects(()=>controller({profileId,newPassword:'12345'}),error=>error.code==='invalid_request');assert.equal(changes,2);
console.log('PASS password change controller: current bearer proof, in-place replacement session, pre-change failure preserves existing session');
