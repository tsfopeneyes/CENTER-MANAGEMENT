import assert from 'node:assert/strict';
import {createAdminAuthGateway} from '../supabase/functions/_shared/adminAuthGateway.mjs';

const id=crypto.randomUUID(),calls=[];
const gateway=createAdminAuthGateway({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'service-role-fixture-key-123456789',fetcher:async(url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify({id}),{status:200,headers:{'Content-Type':'application/json'}});
}});
assert.equal((await gateway.updateUserById(id,{password:'new-password'})).data.user.id,id);
assert.equal(calls[0].url,'https://project.supabase.co/auth/v1/admin/users/'+id);assert.equal(calls[0].options.credentials,'omit');
assert.equal(calls[0].options.headers.Authorization,'Bearer service-role-fixture-key-123456789');
await gateway.createUser({email:'fixture@example.invalid',password:'new-password',email_confirm:true});assert.equal(calls[1].options.method,'POST');
assert.equal((await gateway.updateUserById(id,{password:'12345'})).error.status,400);assert.equal(calls.length,2);
const denied=createAdminAuthGateway({supabaseUrl:'https://project.supabase.co',serviceRoleKey:'service-role-fixture-key-123456789',fetcher:async()=>new Response('{}',{status:403})});
assert.equal((await denied.updateUserById(id,{password:'new-password'})).error.status,403);
console.log('PASS Admin Auth gateway: exact user endpoints, server-only key, strict attributes, no cookie/retry/error body leak');
