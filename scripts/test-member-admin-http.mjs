import assert from 'node:assert/strict';
import {createMemberAdminHandler} from '../supabase/functions/_shared/memberAdminHandler.mjs';
import {createMemberAdminTransport} from '../src/auth/memberAdminTransport.js';

const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003'];
const calls=[];const members={
    setRole:async input=>{calls.push(['role',input]);return {protocol:1,status:'saved'};},
    withdraw:async input=>{calls.push(['withdraw',input]);return {protocol:1,status:'withdrawn'};},
    merge:async input=>{calls.push(['merge',input]);return {protocol:1,status:'merged'};},
    listReviews:async input=>{calls.push(['list',input]);return {protocol:1,status:'ok',reviews:[]};}
};
const handler=createMemberAdminHandler({members,allowedOrigins:['https://app.example']});
const fetcher=async(url,options)=>handler(new Request(url,{...options,headers:{...options.headers,Origin:'https://app.example'}}));
const transport=createMemberAdminTransport({endpoint:'https://api.example/members',publishableKey:'public',
    auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},fetcher});
await transport.setRole({profileId:ids[0],admin:true});
await transport.withdraw({profileId:ids[1]});
await transport.merge({requestId:ids[0],sourceProfileId:ids[1],targetProfileId:ids[2]});
assert.deepEqual(await transport.listReviews(),{protocol:1,status:'ok',reviews:[]});
assert.deepEqual(calls.map(item=>item[0]),['role','withdraw','merge','list']);
for(const [,input] of calls)assert.equal(input.accessToken,'token');
assert.equal((await handler(new Request('https://api.example/members',{method:'POST',body:'{}'}))).status,401);
assert.equal((await handler(new Request('https://api.example/members',{method:'POST',headers:{Authorization:'Bearer token'},
    body:JSON.stringify({protocol:1,action:'list-merge-reviews',extra:true})}))).status,400);
assert.throws(()=>createMemberAdminTransport({endpoint:'http://remote.invalid/members',auth:{}}));
console.log('PASS member administration HTTP: current bearer, exact role/merge/review actions, no cookies/fallback and bounded input');
