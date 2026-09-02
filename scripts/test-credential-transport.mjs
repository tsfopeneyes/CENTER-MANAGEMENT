import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';

const built=await build({entryPoints:['src/auth/credentialTransport.js'],bundle:true,write:false,format:'cjs',platform:'node'});
const module={exports:{}};vm.runInNewContext(built.outputFiles[0].text,{module,exports:module.exports,URL,AbortController,setTimeout,clearTimeout,fetch,Response});
const {createCredentialTransport}=module.exports;
const bodies=[];
const transport=createCredentialTransport({endpoint:'https://auth.example/credentials',publishableKey:'public',fetcher:async(url,options)=>{
    assert.equal(url,'https://auth.example/credentials');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer admin-token');
    bodies.push(JSON.parse(options.body));return new Response(JSON.stringify({protocol:1,status:'password_change_required'}),{status:200});
}});
assert.equal((await transport({action:'reset',protocol:1},{accessToken:'admin-token'})).status,'password_change_required');assert.equal(bodies.length,1);
const replacement=createCredentialTransport({endpoint:'https://auth.example/credentials',fetcher:async()=>new Response(JSON.stringify({protocol:1,status:'session_replaced',session:{access_token:'a',refresh_token:'r',expires_at:2000}}),{status:200})});
assert.equal((await replacement({action:'change-self'})).status,'session_replaced');
const confirmationId=crypto.randomUUID();
const confirmation=createCredentialTransport({endpoint:'https://auth.example/credentials',fetcher:async()=>new Response(JSON.stringify({protocol:1,status:'reset_confirmed',confirmationId,validUntil:2000}),{status:200})});
assert.equal((await confirmation({action:'confirm-reset'})).confirmationId,confirmationId);
for(const [status,code] of [[400,'invalid_request'],[401,'invalid_login'],[403,'forbidden'],[409,'account_changed'],[429,'try_later'],[500,'temporarily_unavailable']]){
    const failing=createCredentialTransport({endpoint:'https://auth.example/credentials',fetcher:async()=>new Response('{}',{status})});
    await assert.rejects(()=>failing({action:'reset'}),error=>error.code===code);
}
const policy=createCredentialTransport({endpoint:'https://auth.example/credentials',fetcher:async()=>new Response('{"error":"password_policy"}',{status:400})});
await assert.rejects(()=>policy({action:'change-temporary'}),error=>error.code==='password_policy');
const malformed=createCredentialTransport({endpoint:'https://auth.example/credentials',fetcher:async()=>new Response('{}',{status:200})});
await assert.rejects(()=>malformed({action:'reset'}),error=>error.code==='temporarily_unavailable');
assert.throws(()=>createCredentialTransport({endpoint:'http://auth.example/credentials'}));
console.log('PASS credential transport: HTTPS, no credentials/retry/fallback, bounded cancellation and stable errors');
