import assert from 'node:assert/strict';
import {createAdminResetController} from '../src/auth/adminResetController.js';

const profileId=crypto.randomUUID(),confirmationId=crypto.randomUUID();let calls=[],failConfirm=false,failReset=false;
const controller=createAdminResetController({now:()=>1000,exclusive:async work=>work(),auth:{async getSession(){return {data:{session:{access_token:'admin-token'}}};}},
    async credentials(input,options){calls.push({input,options});if(input.action==='confirm-reset'){
        if(failConfirm)throw Error('confirm failed');return {protocol:1,status:'reset_confirmed',confirmationId,validUntil:2000};}
        if(failReset)throw Error('reset failed');return {protocol:1,status:'password_change_required'};}
});
assert.deepEqual(await controller({profileId}),{status:'password_change_required'});assert.deepEqual(calls.map(c=>c.input.action),['confirm-reset','reset']);
assert.equal(calls[1].input.confirmationId,confirmationId);assert.equal(calls[0].options.accessToken,'admin-token');
calls=[];failConfirm=true;await assert.rejects(()=>controller({profileId}));assert.equal(calls.length,1);failConfirm=false;
calls=[];failReset=true;await assert.rejects(()=>controller({profileId}));assert.equal(calls.length,2);
await assert.rejects(()=>controller({profileId:'bad'}),error=>error.code==='invalid_request');
console.log('PASS administrator reset controller: one UI action, current bearer, server confirmation chain, no phone or temporary secret');
