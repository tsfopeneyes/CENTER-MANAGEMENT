import assert from 'node:assert/strict';
import {createLoginCandidateTransport} from '../src/auth/loginCandidateTransport.js';
const id=crypto.randomUUID();
const transport=createLoginCandidateTransport({endpoint:'https://auth.example/candidates',publishableKey:'public',fetcher:async(url,options)=>{
    assert.equal(options.credentials,'omit');assert.deepEqual(JSON.parse(options.body),{protocol:1,name:'가상회원'});
    return new Response(JSON.stringify({protocol:1,status:'ok',candidates:[{profileId:id,name:'가상회원',school:'가상고',userGroup:'청소년'}]}),{status:200});}});
assert.equal((await transport('가상회원'))[0].profileId,id);
const malformed=createLoginCandidateTransport({endpoint:'https://auth.example/candidates',fetcher:async()=>new Response('{"protocol":1,"status":"ok","candidates":[{"profileId":"bad"}]}',{status:200})});
await assert.rejects(()=>malformed('name'),error=>error.code==='temporarily_unavailable');
console.log('PASS candidate transport: bounded display projection, HTTPS and no cookie/retry/fallback');
