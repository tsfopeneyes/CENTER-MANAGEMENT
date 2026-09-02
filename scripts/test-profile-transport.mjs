import assert from 'node:assert/strict';
import {createProfileTransport} from '../src/auth/profileTransport.js';

const profileId=crypto.randomUUID(),calls=[];
const transport=createProfileTransport({endpoint:'https://auth.example/profile',publishableKey:'public',fetcher:async(url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify({protocol:1,status:'ok',profile:{id:profileId}}),{status:200});
}});
const result=await transport({action:'read',profileId},{accessToken:'access'});assert.equal(result.profile.id,profileId);
assert.equal(calls[0].options.headers.Authorization,'Bearer access');assert.equal(calls[0].options.credentials,'omit');
await assert.rejects(()=>transport({action:'read',profileId},{}),error=>error.code==='invalid_login');
for(const [status,code] of [[400,'invalid_request'],[401,'invalid_login'],[403,'forbidden'],[409,'account_changed'],[500,'temporarily_unavailable']]){
    const failing=createProfileTransport({endpoint:'https://auth.example/profile',fetcher:async()=>new Response('{}',{status})});
    await assert.rejects(()=>failing({action:'read',profileId},{accessToken:'access'}),error=>error.code===code);
}
assert.throws(()=>createProfileTransport({endpoint:'http://remote.invalid/profile'}));
console.log('PASS profile transport: bearer-only HTTPS, no cookie/retry/fallback and stable errors');
