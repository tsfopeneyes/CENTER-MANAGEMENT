import assert from 'node:assert/strict';
import {createRegistrationHandler} from '../supabase/functions/_shared/registrationHandler.mjs';
import {LoginError} from '../supabase/functions/_shared/loginSecurity.mjs';

const calls=[];let fail=null;
const handler=createRegistrationHandler({allowedOrigins:['https://app.example'],resolveClientKey:async()=> 'trusted',register:async(input,context)=>{
    calls.push({input,context});if(fail)throw new LoginError(fail,fail==='try_later'?429:400);return {protocol:1,status:'registered'};}});
const post=body=>handler(new Request('https://auth.example/register',{method:'POST',headers:{Origin:'https://app.example','Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}));
let response=await post({protocol:1});assert.equal(response.status,200);assert.equal(calls[0].context.clientKey,'trusted');
response=await post('x'.repeat(33000));assert.equal(response.status,413);
response=await handler(new Request('https://auth.example/register',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}));assert.equal(response.status,403);
fail='try_later';response=await post({protocol:1});assert.equal(response.status,429);assert.deepEqual(await response.json(),{error:'try_later'});
assert.throws(()=>createRegistrationHandler({register:async()=>{},resolveClientKey:async()=>'',allowedOrigins:['*']}));
console.log('PASS registration HTTP: current form body, trusted origin/client, bounded request and stable non-secret errors');
