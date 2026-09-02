import assert from 'node:assert/strict';
import {createRegistrationTransport} from '../src/auth/registrationTransport.js';

const transport=createRegistrationTransport({endpoint:'https://auth.example/register',publishableKey:'public',fetcher:async(url,options)=>{
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return new Response('{"protocol":1,"status":"registered"}',{status:200});}});
assert.equal((await transport({protocol:1})).status,'registered');
const policy=createRegistrationTransport({endpoint:'https://auth.example/register',fetcher:async()=>new Response('{"error":"password_policy"}',{status:400})});
await assert.rejects(()=>policy({}),error=>error.code==='password_policy');
const unavailable=createRegistrationTransport({endpoint:'https://auth.example/register',fetcher:async()=>new Response('{}',{status:500})});
await assert.rejects(()=>unavailable({}),error=>error.code==='temporarily_unavailable');
assert.throws(()=>createRegistrationTransport({endpoint:'http://remote.invalid/register'}));
console.log('PASS registration transport: HTTPS, no cookie/retry/fallback, policy-aware stable errors');
