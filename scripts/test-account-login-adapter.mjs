import assert from 'node:assert/strict';
import {createAccountLoginAdapter} from '../src/auth/accountLoginAdapter.js';

const profileId=crypto.randomUUID(),authUserId=crypto.randomUUID();
const profile={id:profileId,name:'동명이인',role:'user'};
const adapter=createAccountLoginAdapter({client:{
    candidates:async()=>[{profileId,name:'동명이인',school:'가상고',userGroup:'청소년'}],
    login:{login:async input=>{assert.deepEqual(input,{profileId,password:'1234'});return {profileId,authUserId,profile};}}
}});
assert.deepEqual(await adapter.candidates('동명이인'),[{id:profileId,name:'동명이인',school:'가상고',user_group:'청소년'}]);
assert.deepEqual(await adapter.login({profileId,password:'1234'}),{id:profileId,name:'동명이인',role:'user'});
let nameInput;const byName=createAccountLoginAdapter({client:{candidates:async()=>[],login:{login:async input=>{
    nameInput=input;return {profileId,authUserId,profile};}}}});
assert.deepEqual(await byName.login({name:'동명이인',password:'1234'}),profile);
assert.deepEqual(nameInput,{name:'동명이인',password:'1234'});
const changed=createAccountLoginAdapter({client:{candidates:async()=>[],login:{login:async()=>({profileId,authUserId})}}});
await assert.rejects(changed.login({profileId,password:'1234'}),error=>error.code==='account_changed');
console.log('PASS account login adapter: current candidate/profile shapes and controller-validated profile binding');
