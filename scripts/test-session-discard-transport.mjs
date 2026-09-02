import assert from 'node:assert/strict';
import {createSessionDiscardTransport} from '../src/auth/sessionDiscardTransport.js';

let calls=0;
const discard=createSessionDiscardTransport({supabaseUrl:'https://project.supabase.co',publishableKey:'public',fetcher:async(url,options)=>{
    calls++;assert.equal(url,'https://project.supabase.co/auth/v1/logout?scope=local');assert.equal(options.method,'POST');
    assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer issued-token');return new Response('{}');
}});
await discard('issued-token');assert.equal(calls,1);await discard('');assert.equal(calls,1);
const failing=createSessionDiscardTransport({supabaseUrl:'https://project.supabase.co',publishableKey:'public',fetcher:async()=>{throw Error('offline');}});
await failing('issued-token');
assert.throws(()=>createSessionDiscardTransport({supabaseUrl:'http://remote.invalid',publishableKey:'public'}));
console.log('PASS token-specific discard: exact Supabase logout endpoint, no SDK/shared-session signout, bounded best-effort failure');
