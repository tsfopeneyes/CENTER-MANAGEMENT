import assert from 'node:assert/strict';
import {createLoginController,createBrowserAuthLock} from '../src/auth/loginController.js';
import {createLoginTransport,AuthOperationError} from '../src/auth/loginTransport.js';

const uid=crypto.randomUUID(),profile=crypto.randomUUID(),sid=crypto.randomUUID(),oldId=crypto.randomUUID();
const session={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Date.now()/1000+3600,user:{id:uid}};
const issued={protocol:1,profileId:profile,authUserId:uid,session};
const loadedProfile={id:profile,name:'fixture'};
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(setImmediate);
function fixture(overrides={}) {
    let current={access_token:'old-session',user:{id:oldId}};
    const calls=[],discarded=[];
    const auth={
        async setSession(value){calls.push('set');current={...value,user:{id:uid}};return {data:{session:current,user:{id:uid}}};},
        async getSession(){calls.push('get');return {data:{session:current}};},
        async signOut(options){assert.deepEqual(options,{scope:'local'});calls.push('logout');current=null;return {error:null};}
    };
    const deps={auth,login:async()=>issued,readProfile:async()=>({protocol:1,status:'ok',profile:loadedProfile}),
        discardCreatedSession:async(token)=>{discarded.push(token);},exclusive:async(fn)=>fn(),...overrides};
    return {controller:createLoginController(deps),deps,calls,discarded,getCurrent:()=>current};
}
const input={name:'가상회원',password:'1234'};
let f=fixture();
assert.deepEqual(await f.controller.login(input),{profileId:profile,authUserId:uid,profile:loadedProfile});
assert.equal(f.getCurrent().user.id,uid);assert.deepEqual(f.discarded,[]);
await f.controller.logout();assert.equal(f.getCurrent(),null);

// A duplicate-name choice logs in by the server-issued profile id without
// sending a phone number or trusting a browser-supplied display name.
let selectedBody;f=fixture({login:async value=>{selectedBody=value;return issued;}});
assert.deepEqual(await f.controller.login({profileId:profile,password:'1234'}),{profileId:profile,authUserId:uid,profile:loadedProfile});
assert.deepEqual(selectedBody,{action:'login',protocol:1,profileId:profile,password:'1234'});

// Failed credential verification keeps the current SDK identity, with no logout.
f=fixture({login:async()=>{throw new AuthOperationError('invalid_login');}});
await assert.rejects(f.controller.login(input),e=>e.code==='invalid_login');
assert.equal(f.getCurrent().user.id,oldId);assert.deepEqual(f.calls,[]);

f=fixture({readProfile:async()=>({protocol:1,status:'ok',profile:{...loadedProfile,id:crypto.randomUUID()}})});
await assert.rejects(f.controller.login(input),e=>e.code==='account_changed');
assert.deepEqual(f.calls,['set','get']);assert.deepEqual(f.discarded,[]);
f=fixture();await assert.rejects(f.controller.reconfirm({...input,profileId:crypto.randomUUID()}),e=>e.code==='account_changed');
assert.deepEqual(f.calls,[]);

// Login response arrives after logout intent; it must not become an SDK session.
const slow=defer();f=fixture({login:()=>slow.promise});
const pending=f.controller.login(input);const rejected=assert.rejects(pending,e=>e.code==='cancelled');
await tick();const logout=f.controller.logout();slow.resolve(issued);
await rejected;await logout;
assert.deepEqual(f.calls,['logout']);assert.deepEqual(f.discarded,['fixture-access']);assert.equal(f.getCurrent(),null);

// Logout cannot overtake a non-abortable in-flight setSession.
const sdk=defer();const order=[];
f=fixture({auth:{async setSession(){order.push('set-start');await sdk.promise;order.push('set-end');return {data:{session,user:{id:uid}}};},
    async getSession(){return {data:{session}};},async signOut(){order.push('logout');return {};}}});
const during=f.controller.login(input);const duringRejected=assert.rejects(during,e=>e.code==='cancelled');
await tick();const after=f.controller.logout();await tick();assert.deepEqual(order,['set-start']);
sdk.resolve();await duringRejected;await after;assert.deepEqual(order,['set-start','set-end','logout']);

// External account invalidation discards old results, without forcing logout.
const external=defer();f=fixture({login:()=>external.promise});
const earlier=f.controller.login(input);const earlierRejected=assert.rejects(earlier,e=>e.code==='cancelled');
await tick();f.controller.invalidate();external.resolve(issued);await earlierRejected;assert.deepEqual(f.calls,[]);

// SDK errors after mutation are uncertain, not license to restore an old token.
f=fixture({auth:{async setSession(){return {error:Error('fixture failure')};},async getSession(){throw Error('must not read');},
    async signOut(){throw Error('must not sign out');}}});
await assert.rejects(f.controller.login(input),e=>e.code==='session_apply_failed');assert.deepEqual(f.discarded,[]);

// A rejected SDK promise may still have persisted the session. Cleanup must not
// revoke that now-current session merely because no result was returned.
f=fixture({auth:{async setSession(){throw Error('storage result uncertain');},async getSession(){throw Error('must not read');},
    async signOut(){throw Error('must not sign out');}}});
await assert.rejects(f.controller.login(input),e=>e.code==='temporarily_unavailable');
assert.deepEqual(f.discarded,[],'Never revoke a session once its SDK write has started');

// An external tab changes account while the final server proof is in flight.
// A valid proof of the OLD token must not commit the old profile to the UI.
let latest=session;
f=fixture({auth:{async setSession(){latest=session;return {data:{session,user:{id:uid}}};},
    async getSession(){return {data:{session:latest}};},async signOut(){throw Error('no automatic logout');}},
    readProfile:async()=>{latest={...session,access_token:'other-tab-token',user:{id:oldId}};return {protocol:1,status:'ok',profile:loadedProfile};}});
await assert.rejects(f.controller.login(input),e=>e.code==='account_changed');
assert.deepEqual(f.discarded,[]);assert.equal(latest.user.id,oldId);

// Request snapshot excludes injected fields and preserves raw password spacing.
let body;f=fixture({login:async(value)=>{body=value;return issued;}});
const mutable={name:'가상회원',password:' 1234 ',role:'admin',hashedPassword:'not sent'};
const snap=f.controller.login(mutable);mutable.password='changed';await snap;
assert.deepEqual(body,{action:'login',protocol:1,name:'가상회원',password:' 1234 '});

assert.throws(()=>createBrowserAuthLock({locks:null,name:'auth'}));
let lockCalls=0;
const lock=createBrowserAuthLock({name:'fixture-auth',locks:{async request(name,options,fn){
    assert.equal(name,'fixture-auth');assert.equal(options.mode,'exclusive');lockCalls++;return fn();}}});
assert.equal(await lock(()=>42),42);assert.equal(lockCalls,1);

for(const endpoint of ['http://unsafe.example/login','https://user:password@fixture.invalid/login','https://fixture.invalid/login?token=x']){
    assert.throws(()=>createLoginTransport({endpoint}));
}
let requests=0;
const transport=createLoginTransport({endpoint:'https://fixture.invalid/login',fetcher:async(url,options)=>{
    requests++;assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');
    assert.deepEqual(JSON.parse(options.body),{action:'login',protocol:1,...input});
    return Response.json(issued);
}});
assert.deepEqual(await transport({action:'login',protocol:1,...input}),JSON.parse(JSON.stringify(issued)));assert.equal(requests,1);
for(const [status,code] of [[401,'invalid_login'],[409,'account_changed'],[429,'try_later'],[500,'temporarily_unavailable']]){
    let count=0;const bad=createLoginTransport({endpoint:'https://fixture.invalid/login',fetcher:async()=>{count++;return new Response('secret raw error',{status});}});
    await assert.rejects(bad(input),e=>e.code===code && !e.message.includes('secret'));assert.equal(count,1);
}
for(const [status,code] of [[404,'name_not_found'],[409,'selection_required']]){
    const response=createLoginTransport({endpoint:'https://fixture.invalid/login',fetcher:async()=>Response.json({error:code},{status})});
    await assert.rejects(response(input),error=>error.code===code);
}
const timed=createLoginTransport({endpoint:'https://fixture.invalid/login',timeoutMs:10,fetcher:(_,options)=>new Promise((_,reject)=>{
    options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
})});
await assert.rejects(timed(input),e=>e.code==='cancelled');
console.log('PASS login controller: identity proofs, preserved session on credential failure, logout ordering, stale results, request snapshots, explicit cross-tab lock and bounded no-retry transport');
