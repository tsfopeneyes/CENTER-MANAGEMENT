import assert from 'node:assert/strict';
import {createRegistrationController} from '../src/auth/registrationController.js';

const calls=[];let fail=true;
const controller=createRegistrationController({register:async input=>{calls.push(input);if(fail)throw Error('lost response');return {protocol:1,status:'registered'};}});
const submission={password:'123456',details:{formData:{name:'fixture'},agreements:{art1:true},termsVersion:'v1'}};
await assert.rejects(()=>controller.submit(submission));fail=false;assert.deepEqual(await controller.submit(submission),{status:'registered'});
assert.equal(calls[0].requestSecret,calls[1].requestSecret);assert.equal(calls[0].enrollmentId,calls[1].enrollmentId);
assert.ok(!JSON.stringify(calls[0].details).includes(calls[0].requestSecret));
await assert.rejects(()=>controller.submit({...submission,password:'12345'}),error=>error.code==='invalid_request');
console.log('PASS registration controller: six-character permanent password, in-memory uncertain retry identity, no secret persistence');
