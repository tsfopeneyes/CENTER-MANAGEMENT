import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createLoginKey} from '../supabase/functions/_shared/loginSecurity.mjs';
import {createPasswordGateway} from '../supabase/functions/_shared/passwordGateway.mjs';
import {createLoginService} from '../supabase/functions/_shared/loginService.mjs';
import {createLoginStore} from '../supabase/functions/_shared/loginStore.mjs';
import {createLoginHandler} from '../supabase/functions/_shared/loginHandler.mjs';
import {createVerifiedSessionReader} from '../supabase/functions/_shared/verifiedSession.mjs';
import {createSessionReadStore} from '../supabase/functions/_shared/sessionReadStore.mjs';
import {createAccountAuthService} from '../supabase/functions/_shared/accountAuthService.mjs';
import {createSessionCoordinator} from '../src/auth/sessionCoordinator.js';
import {createSessionTransport} from '../src/auth/sessionTransport.js';
import {createLoginTransport} from '../src/auth/loginTransport.js';
import {createLoginController} from '../src/auth/loginController.js';

// In-memory DB + fake Auth provider; never imports credentials or a live SDK.
const db=new PGlite();
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const p='10000000-0000-4000-8000-000000000011',q='10000000-0000-4000-8000-000000000012';
const oldSession='10000000-0000-4000-8000-000000000021';
const password=' fixture password ';
const keyFor=await createLoginKey('fixture-lookup-secret-not-a-real-key-0123456789');
const query=(text,values)=>db.query(text,values);
let releases=0,connections=0;
const pool={query,connect:async()=>{connections++;return {query,release(){releases++;}};}};
const store=createLoginStore(pool);
const origin='https://fixture-auth.example.invalid';
let signIns=0,wrongIdentity=false,hook=null,authStatus=200,cleanupFails=false;
const issued=new Map(), discarded=[];
// The fake Auth provider represents a separate privileged service. PGlite has
// one connection here, so temporarily switch ONLY inside that fixture adapter.
const providerWrite=async(text,values)=>{
    const role=(await query('SELECT current_user AS role')).rows[0].role;
    if(!['postgres','account_login_worker'].includes(role))throw Error('Unexpected fixture role');
    await db.exec('RESET ROLE');
    try{return await query(text,values);}
    finally{if(role==='account_login_worker')await db.exec('SET ROLE account_login_worker');}
};
const provider=async(url,options)=>{
    assert.ok(url.startsWith(origin+'/auth/v1/'));
    assert.equal(options.redirect,'error');
    if(url.includes('/token?')){
        signIns++;
        const body=JSON.parse(options.body);
        assert.deepEqual(Object.keys(body).sort(),['email','password']);
        if(authStatus!==200)return new Response('{}',{status:authStatus});
        if(body.password!==password)return new Response('{"error":"invalid_credentials"}',{status:400});
        const authId=body.email==='first@example.invalid'?a:b;
        const sid=crypto.randomUUID();
        await providerWrite('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[sid,authId]);
        const claims={sub:authId,session_id:sid,iss:origin+'/auth/v1',aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600};
        const token=[Buffer.from('{"alg":"RS256"}').toString('base64url'),Buffer.from(JSON.stringify(claims)).toString('base64url'),'fixture-signature'].join('.');
        issued.set(token,{sid,authId});
        if(hook)await hook();
        return Response.json({access_token:token,refresh_token:'fixture-refresh-'+sid,user:{id:wrongIdentity?b:authId},expires_in:3600});
    }
    const token=options.headers.Authorization?.slice(7);
    const item=issued.get(token);
    if(url.endsWith('/user'))return item?Response.json({id:item.authId,is_anonymous:false}):new Response('{}',{status:401});
    assert.ok(url.endsWith('/logout?scope=local'));
    if(cleanupFails)throw Error('fixture cleanup unavailable');
    assert.ok(item,'cleanup only receives tokens created by this provider');
    discarded.push(item.sid);await providerWrite('DELETE FROM auth.sessions WHERE id=$1',[item.sid]);
    return new Response(null,{status:204});
};
const gateway=createPasswordGateway({supabaseUrl:origin,publishableKey:'fixture-key',fetcher:provider});
const verifyToken=createVerifiedSessionReader({supabaseUrl:origin,publishableKey:'fixture-key',fetcher:provider,
    loadLiveSession:createSessionReadStore(query).loadLiveSession});
const legacyBridge={verify:async()=>false,providerPassword:async()=>{throw Error('standard fixture must not bridge');}};
const deps={store,gateway,verifyToken,keyFor,legacyBridge,assuranceTtlMs:86400000,readiness:async()=>true};
const login=createLoginService(deps);
const invoke=(input,overrides={})=>login(input,{clientKey:'fixture-trusted-client',...overrides});
const reconfirm={action:'reconfirm',protocol:1,profileId:p,password};
const initial={action:'login',protocol:1,name:'가상회원',phone:'010-1111-1111',password};
const limits=()=>db.exec('TRUNCATE account_security.login_limits');
const rejected=async(input,code='invalid_login')=>{
    await assert.rejects(invoke(input),error=>error.code===code);
    assert.equal((await query('SELECT count(*)::int AS n FROM auth.sessions WHERE id=$1',[oldSession])).rows[0].n,1);
};
let server,coordinator;
try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
        CREATE TABLE public.users(id uuid PRIMARY KEY,name text,school text,user_group text,password text);
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,banned_until timestamptz,encrypted_password text);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
        INSERT INTO public.users VALUES('${p}','original-one','school-one','청소년','unchanged'),('${q}','original-two','school-two','졸업생','unchanged');
        INSERT INTO auth.users VALUES('${a}',false,NULL,'unchanged'),('${b}',false,NULL,'unchanged');
        INSERT INTO auth.sessions VALUES('${oldSession}','${a}',NULL);`);
    const original=await query('SELECT row_to_json(u) AS data FROM public.users u ORDER BY id');
    const originalAuth=await query('SELECT row_to_json(u) AS data FROM auth.users u ORDER BY id');
    for(const name of ['auth-session-foundation','auth-login-foundation'])await db.exec(readFileSync(new URL('../supabase/manual/proposals/'+name+'.sql',import.meta.url),'utf8'));
    await query(`INSERT INTO account_security.accounts(profile_id,auth_user_id,mapping_verified,status,must_change_password)
        VALUES($1,$2,true,'active',false),($3,$4,true,'active',false)`,[p,a,q,b]);
    for(const [id,email,phone] of [[p,'first@example.invalid','01011111111'],[q,'second@example.invalid','01022222222']]){
        await query(`INSERT INTO account_security.login_identifiers(profile_id,login_email,name_key,phone_key,credential_mode,enabled)
            VALUES($1,$2,$3,$4,'supabase_password',true)`,[id,email,await keyFor('name','가상회원'),await keyFor('phone',phone)]);
    }

    await db.exec('SET ROLE account_login_worker');
    const displayCandidates=await store.findCandidatesByName(await keyFor('name','가상회원'));
    assert.deepEqual(displayCandidates.map(item=>item.profileId),[p,q]);assert.ok(displayCandidates.every(item=>!('password' in item)));
    const success=await invoke(reconfirm);
    assert.equal(success.profileId,p);assert.equal(success.authUserId,a);
    assert.deepEqual(Object.keys(success).sort(),['authUserId','profileId','protocol','session']);
    const trusted=(await query('SELECT * FROM account_security.session_assurances')).rows;
    assert.equal(trusted.length,1);assert.equal(trusted[0].status,'trusted');
    await assert.rejects(query('SELECT encrypted_password FROM auth.users'),/permission denied/);
    await assert.rejects(query("UPDATE public.users SET password='not-allowed'"),/permission denied/);
    await assert.rejects(query("UPDATE auth.users SET encrypted_password='not-allowed'"),/permission denied/);
    await db.exec('RESET ROLE');
    await limits();
    assert.equal((await invoke(initial)).profileId,p);
    await rejected({...initial,phone:undefined},'selection_required'); // same name requires explicit choice
    assert.equal((await invoke({...initial,phone:'01022222222'})).profileId,q);
    await rejected({...initial,phone:'01033333333'},'name_not_found');
    await rejected({...reconfirm,password:'wrong'});
    await rejected({...reconfirm,password:'f'.repeat(64)}); // no legacy hash fallback
    await rejected({...reconfirm,role:'admin'});
    await rejected({...reconfirm,profileId:'invalid'});
    await rejected({...initial,password:'x'.repeat(129)});

    await limits();
    const beforeSignIn=signIns;
    await query("UPDATE account_security.login_identifiers SET credential_mode='legacy_pending' WHERE profile_id=$1",[p]);
    await rejected(reconfirm);assert.equal(signIns,beforeSignIn,'legacy credentials are not silently accepted');
    await query("UPDATE account_security.login_identifiers SET credential_mode='supabase_password' WHERE profile_id=$1",[p]);
    await query('UPDATE account_security.accounts SET must_change_password=true WHERE profile_id=$1',[p]);
    await rejected(reconfirm,'password_change_required');
    await query('UPDATE account_security.accounts SET must_change_password=false WHERE profile_id=$1',[p]);

    await limits();
    wrongIdentity=true;await rejected(reconfirm);wrongIdentity=false;
    hook=()=>query('UPDATE account_security.accounts SET credential_version=credential_version+1 WHERE profile_id=$1',[p]);
    await rejected(reconfirm,'account_changed');hook=null;
    hook=()=>query("UPDATE account_security.accounts SET status='blocked' WHERE profile_id=$1",[p]);
    await rejected(reconfirm,'account_changed');hook=null;
    await query("UPDATE account_security.accounts SET status='active' WHERE profile_id=$1",[p]);
    const epoch=(await query('SELECT credential_version FROM account_security.accounts WHERE profile_id=$1',[p])).rows[0].credential_version;
    hook=()=>query("UPDATE account_security.login_identifiers SET login_email='changed@example.invalid' WHERE profile_id=$1",[p]);
    await rejected(reconfirm,'account_changed');hook=null;
    assert.equal((await query('SELECT credential_version FROM account_security.accounts WHERE profile_id=$1',[p])).rows[0].credential_version,epoch+1);
    await query("UPDATE account_security.login_identifiers SET login_email='first@example.invalid' WHERE profile_id=$1",[p]);
    await assert.rejects(query('UPDATE account_security.login_identifiers SET profile_id=$1 WHERE profile_id=$2',[q,p]),/cannot be reassigned/);

    await limits();
    const same=await store.findByProfile(p);
    const sid=trusted[0].session_id;
    await query("UPDATE account_security.session_assurances SET status='revoked' WHERE session_id=$1",[sid]);
    await assert.rejects(store.grantAssurance(same[0],{authUserId:a,sessionId:sid,expiresAt:Date.now()+60000},Date.now()+86400000),e=>e.code==='account_changed');
    assert.equal((await query('SELECT status FROM account_security.session_assurances WHERE session_id=$1',[sid])).rows[0].status,'revoked');

    // Both entry points consume the same resolved-account quota.
    await limits();
    for(let i=0;i<5;i++)await rejected(i%2?{...initial,password:'wrong'}:{...reconfirm,password:'wrong'});
    const blockedCalls=signIns;await rejected(reconfirm,'try_later');assert.equal(signIns,blockedCalls);
    await limits();
    const quotaKey=await keyFor('test','parallel');
    const quota=await Promise.all(Array.from({length:20},()=>store.consumeLimit(quotaKey,5)));
    assert.equal(quota.filter(Boolean).length,5);
    assert.equal((await query('SELECT attempts FROM account_security.login_limits WHERE key=$1',[quotaKey])).rows[0].attempts,5);

    await limits();authStatus=503;await rejected(reconfirm,'temporarily_unavailable');authStatus=200;
    const abort=new AbortController();abort.abort();
    await assert.rejects(invoke(reconfirm,{signal:abort.signal}),e=>e.code==='temporarily_unavailable');
    const disabled=createLoginService({...deps,readiness:undefined});
    await assert.rejects(disabled(reconfirm,{clientKey:'fixture'}),e=>e.code==='temporarily_unavailable');
    await assert.rejects(invoke(reconfirm,{clientKey:''}),e=>e.code==='temporarily_unavailable');
    cleanupFails=true;wrongIdentity=true;await rejected(reconfirm);cleanupFails=false;wrongIdentity=false;
    const failedSid=[...issued.values()].at(-1).sid;
    assert.equal((await query('SELECT count(*)::int AS n FROM account_security.session_assurances WHERE session_id=$1',[failedSid])).rows[0].n,0);
    assert.ok(!discarded.includes(oldSession));
    assert.equal(connections,releases);

    // Timeout while Auth is responding: later success must not mint evidence or
    // reach the caller, and cleanup must work despite the aborted parent request.
    await limits();
    let resume,finished,authReturned,triggerDeadline;
    const pause=new Promise(resolve=>{resume=resolve;});
    const done=new Promise(resolve=>{finished=resolve;});
    const atAuthResponse=new Promise(resolve=>{authReturned=resolve;});
    const slowLogin=createLoginService({...deps,gateway:{...gateway,signIn:async(...args)=>{
        const result=await gateway.signIn(...args);authReturned();await pause;return result;
    }}});
    const slowHandler=createLoginHandler({login:(...args)=>slowLogin(...args).finally(finished),
        resolveClientKey:async()=> 'fixture-slow-ingress',timeoutMs:25,
        schedule:callback=>{triggerDeadline=callback;return 1;},cancelTimer:()=>{}});
    const responsePromise=slowHandler(new Request('http://localhost/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reconfirm)}));
    // Fire the deadline at the intended Auth-response boundary, rather than
    // assuming setup/SQL finishes within 25ms on a loaded machine.
    await atAuthResponse;triggerDeadline();const timedOut=await responsePromise;
    assert.equal(timedOut.status,503);
    resume();await done;
    const lateSid=[...issued.values()].at(-1).sid;
    assert.ok(discarded.includes(lateSid));
    assert.equal((await query('SELECT count(*)::int AS n FROM account_security.session_assurances WHERE session_id=$1',[lateSid])).rows[0].n,0);
    assert.equal((await query('SELECT count(*)::int AS n FROM auth.sessions WHERE id=$1',[oldSession])).rows[0].n,1);

    const beforeDelete=(await query('SELECT credential_version FROM account_security.accounts WHERE profile_id=$1',[q])).rows[0].credential_version;
    await query('DELETE FROM account_security.login_identifiers WHERE profile_id=$1',[q]);
    assert.equal((await query('SELECT credential_version FROM account_security.accounts WHERE profile_id=$1',[q])).rows[0].credential_version,beforeDelete+1);

    for(const role of ['anon','authenticated']){
        await db.exec('SET ROLE '+role);
        for(const table of ['login_identifiers','login_limits'])await assert.rejects(query('SELECT * FROM account_security.'+table),/permission denied/);
        await assert.rejects(query("INSERT INTO account_security.session_assurances VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,'trusted',now())"),/permission denied/);
        await db.exec('RESET ROLE');
    }
    assert.deepEqual(await query('SELECT row_to_json(u) AS data FROM public.users u ORDER BY id'),original);
    assert.deepEqual(await query('SELECT row_to_json(u) AS data FROM auth.users u ORDER BY id'),originalAuth);

    await limits();
    const handler=await createAccountAuthService({readerPool:pool,loginPool:pool,supabaseUrl:origin,publishableKey:'fixture-key',
        lookupSecret:'fixture-lookup-secret-not-a-real-key-0123456789',legacyBridge,resolveClientKey:async()=> 'fixture-ingress',
        allowedOrigins:['http://localhost:5173'],fetcher:provider,readiness:async()=>true,assuranceTtlMs:86400000});
    server=createServer(async(req,res)=>{
        try{
            const response=await handler(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,
                body:['GET','HEAD'].includes(req.method)?undefined:Readable.toWeb(req),duplex:'half'}));
            res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
        }catch{res.writeHead(500);res.end('{}');}
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const endpoint='http://127.0.0.1:'+server.address().port+'/login';
    const post=(body,headers={})=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:5173',...headers},body:JSON.stringify(body)});
    const ok=await post(reconfirm);assert.equal(ok.status,200);assert.equal(ok.headers.get('Cache-Control'),'no-store');
    const okBody=await ok.json();assert.equal(okBody.authUserId,a);assert.ok(okBody.session.access_token);
    assert.ok(!JSON.stringify(okBody).includes(password));assert.ok(!JSON.stringify(okBody).includes('example.invalid'));
    coordinator=createSessionCoordinator({auth:{getSession:async()=>({data:{session:{...okBody.session,user:{id:a}}}})},expectedProfileId:p,
        resolveSession:createSessionTransport({endpoint:endpoint.replace('/login','/session'),publishableKey:'fixture-key'})});
    assert.equal((await coordinator.check()).phase,'ready','new password-verified session passes the common server/client checks');
    const bad=await post({...reconfirm,password:'wrong'});assert.equal(bad.status,401);assert.deepEqual(await bad.json(),{error:'invalid_login'});
    assert.equal((await coordinator.check()).phase,'ready','failed reconfirmation does not destroy the existing verified session');
    assert.equal((await post(reconfirm,{Origin:'https://other.invalid'})).status,403);
    assert.equal((await post({...reconfirm,extra:'x'.repeat(5000)})).status,413);
    assert.throws(()=>createLoginHandler({login}));
    // The new common client now traverses the real local HTTP handlers and SQL
    // evidence store before/after SDK adoption. Only Auth and SDK are fixtures.
    await limits();
    let clientSession={...okBody.session,user:{id:a}};
    const sessionTransport=createSessionTransport({endpoint:endpoint.replace('/login','/session'),publishableKey:'fixture-key'});
    const controller=createLoginController({
        auth:{async setSession(tokens){clientSession={...tokens,user:{id:a}};return {data:{session:clientSession,user:{id:a}}};},
            async getSession(){return {data:{session:clientSession}};},
            async signOut(){await gateway.discardCreatedSession(clientSession.access_token);clientSession=null;return {};}}
        ,login:createLoginTransport({endpoint}),
        readProfile:async(input,{accessToken,signal})=>{const proof=await sessionTransport(accessToken,{signal});
            if(proof.decision!=='retain'||proof.profileId!==input.profileId)throw new Error('profile proof failed');
            return {protocol:1,status:'ok',profile:{id:input.profileId,name:'original-one'}};},
        discardCreatedSession:gateway.discardCreatedSession,exclusive:async(work)=>work()
    });
    assert.deepEqual(await controller.login({name:'가상회원',phone:'010-1111-1111',password}),
        {profileId:p,authUserId:a,profile:{id:p,name:'original-one'}});
    const adopted=clientSession.access_token;
    await assert.rejects(controller.reconfirm({profileId:p,password:'wrong'}),e=>e.code==='invalid_login');
    assert.equal(clientSession.access_token,adopted);
    await controller.logout();assert.equal(clientSession,null);
    assert.equal((await query('SELECT count(*)::int AS n FROM auth.sessions WHERE id=$1',[oldSession])).rows[0].n,1);
    console.log('PASS: standard-password login/reconfirmation, private lookups, duplicate names, shared atomic limits, post-password account changes, no revival, failed-session-only cleanup, raw-record preservation and loopback HTTP. Auth provider mocked; no production changes.');
}finally{
    coordinator?.stop();
    if(server)await new Promise(resolve=>server.close(resolve));
    await db.close();
}
