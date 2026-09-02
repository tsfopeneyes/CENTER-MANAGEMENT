import assert from 'node:assert/strict';
import {createCredentialHandler} from '../supabase/functions/_shared/credentialHandler.mjs';
import {LoginError} from '../supabase/functions/_shared/loginSecurity.mjs';

const calls=[];
const credentials={
    async confirmReset(input,context){calls.push({kind:'confirm',input,context});return {protocol:1,status:'reset_confirmed'};},
    async reset(input,context){calls.push({kind:'reset',input,context});return {protocol:1,status:'password_change_required'};},
    async changeTemporary(input,context){calls.push({kind:'change',input,context});return {protocol:1,status:'login_required'};},
    async changeSelf(input,context){calls.push({kind:'self',input,context});return {protocol:1,status:'session_replaced'};}
};
const handler=createCredentialHandler({credentials,allowedOrigins:['https://app.example'],resolveClientKey:async()=> 'trusted-client'});
const request=(body,options={})=>handler(new Request('https://auth.example/credentials',{method:'POST',headers:{Origin:'https://app.example','Content-Type':'application/json',Authorization:'Bearer fixture-token'},body:typeof body==='string'?body:JSON.stringify(body),...options}));
let response=await request({action:'confirm-reset',protocol:1,profileId:crypto.randomUUID()});
assert.equal(response.status,200);assert.equal(calls[0].kind,'confirm');
response=await request({action:'reset',protocol:1,profileId:crypto.randomUUID(),confirmationId:crypto.randomUUID()});
assert.equal(response.status,200);assert.equal((await response.json()).status,'password_change_required');assert.equal(calls[1].context.clientKey,'trusted-client');assert.equal(calls[1].context.accessToken,'fixture-token');
response=await request({action:'change-temporary',protocol:1,profileId:crypto.randomUUID(),temporaryPassword:'1234',newPassword:'123456'});
assert.equal(response.status,200);assert.equal(calls[2].kind,'change');
response=await request({action:'change-self',protocol:1,profileId:crypto.randomUUID(),newPassword:'123456'});
assert.equal(response.status,200);assert.equal(calls[3].kind,'self');assert.equal(calls[3].context.accessToken,'fixture-token');
response=await request({action:'unknown'});assert.equal(response.status,400);
response=await request('{bad');assert.equal(response.status,400);
response=await handler(new Request('https://auth.example/credentials',{method:'GET'}));assert.equal(response.status,405);
response=await handler(new Request('https://auth.example/credentials',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}));assert.equal(response.status,403);
response=await request('x'.repeat(9000));assert.equal(response.status,413);
const denied=createCredentialHandler({...{credentials,resolveClientKey:async()=> 'x',allowedOrigins:[]}});
credentials.reset=async()=>{throw new LoginError('forbidden',403);};
response=await denied(new Request('https://auth.example/credentials',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset'})}));
assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'forbidden'});
assert.throws(()=>createCredentialHandler({credentials,resolveClientKey:()=>'',allowedOrigins:['*']}),/Trusted/);
console.log('PASS credential HTTP: bounded body, strict action routing, trusted origin/client, safe errors and no secret response expansion');
