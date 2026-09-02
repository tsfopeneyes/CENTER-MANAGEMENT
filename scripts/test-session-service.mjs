import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {createSessionService} from '../supabase/functions/_shared/sessionService.mjs';
import {createSessionStatusHandler} from '../supabase/functions/_shared/sessionStatusHandler.mjs';
import {createVerifiedSessionReader} from '../supabase/functions/_shared/verifiedSession.mjs';
import {createSessionSnapshot} from '../supabase/functions/_shared/sessionReadStore.mjs';
import {createSessionCoordinator} from '../src/auth/sessionCoordinator.js';
import {createSessionTransport} from '../src/auth/sessionTransport.js';

// In-memory PostgreSQL and loopback HTTP only. No .env or production SDK clients.
const db = new PGlite();
const authId = '10000000-0000-4000-8000-000000000001';
const profileId = '10000000-0000-4000-8000-000000000002';
const sessionId = '10000000-0000-4000-8000-000000000003';
const otherId = '10000000-0000-4000-8000-000000000004';
const authOrigin = 'https://auth.example.invalid';
const now = Date.now();
const claims = {sub: authId, session_id: sessionId, iss: authOrigin + '/auth/v1',
    aud: 'authenticated', role: 'authenticated', exp: Math.floor(now / 1000) + 3600};
const jwt = values => [Buffer.from('{"alg":"RS256"}').toString('base64url'),
    Buffer.from(JSON.stringify(values)).toString('base64url'), 'fixture-signature'].join('.');
const token = jwt(claims);
let authStatus = 200, authUser = {id: authId, is_anonymous: false}, upstreamCalls = 0;
let connected = 0, released = 0, concurrent = false;
const sql = (text, params) => db.query(text, params);
const pool = {connect: async () => {
    assert.equal(concurrent, false, 'test pool intentionally serial'); concurrent = true; connected++;
    return {query: sql, release() { concurrent = false; released++; }};
}};
const fetcher = async (url, options) => {
    upstreamCalls++;
    assert.equal(url, authOrigin + '/auth/v1/user'); assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(authStatus === 200 ? authUser : {error: 'private upstream detail'}), {status: authStatus});
};
const service = createSessionService({pool, supabaseUrl: authOrigin, publishableKey: 'fixture-key',
    allowedOrigins: ['http://localhost:5173'], fetcher});
const request = (options = {}) => new Request('http://localhost/session', {
    method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token,
        Origin: 'http://localhost:5173'}, body: JSON.stringify({action: 'session-status', protocol: 1}), ...options,
});
const baseHeaders = Object.fromEntries(request().headers);
const decision = async (status, expected) => {
    const response = await service(request()); assert.equal(response.status, status);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = await response.json(); assert.equal(body.decision, expected);
    for (const secret of ['password', 'fixture-signature', 'fixture-key', 'private upstream detail']) {
        assert.ok(!JSON.stringify(body).includes(secret));
    }
    assert.equal(connected, released); return body;
};
let server, coordinator;
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
        CREATE TABLE public.users(id uuid PRIMARY KEY, name text, password text);
        CREATE TABLE auth.users(id uuid PRIMARY KEY, is_anonymous boolean, banned_until timestamptz, encrypted_password text);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid, not_after timestamptz);
        INSERT INTO public.users VALUES ('${profileId}', 'fixture', 'never-output');
        INSERT INTO auth.users VALUES ('${authId}', false, NULL, 'never-output');
        INSERT INTO auth.sessions VALUES ('${sessionId}', '${authId}', now() + interval '1 hour');`);
    const before = await sql('SELECT row_to_json(u) AS row FROM public.users u');
    await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-session-foundation.sql', import.meta.url), 'utf8'));
    assert.deepEqual(await sql('SELECT row_to_json(u) AS row FROM public.users u'), before);
    await sql(`INSERT INTO account_security.accounts(profile_id,auth_user_id,mapping_verified,status,must_change_password)
        VALUES ($1,$2,true,'active',false)`, [profileId, authId]);
    await sql(`INSERT INTO account_security.session_assurances(session_id,auth_user_id,profile_id,credential_version,status,valid_until)
        VALUES ($1,$2,$3,1,'trusted',now()+interval '1 hour')`, [sessionId, authId, profileId]);

    await assert.rejects(createSessionSnapshot(pool)(() => sql("UPDATE account_security.accounts SET status='blocked'")), /read-only/);
    assert.equal(connected,released);
    let discarded=false;
    await assert.rejects(createSessionSnapshot({connect:async()=>({query:async()=>{throw Error('begin failed');},release:value=>{discarded=value;}})})(()=>{}));
    assert.equal(discarded,true,'a connection with uncertain BEGIN state must not return to the pool');

    // A genuine reader role can read only the required columns and cannot write.
    await db.exec('SET ROLE account_session_reader');
    const retained = await decision(200, 'retain');
    assert.equal(retained.profileId, profileId); assert.equal(retained.authUserId, authId);
    await assert.rejects(sql('SELECT encrypted_password FROM auth.users'), /permission denied/);
    await assert.rejects(sql('SELECT password FROM public.users'), /permission denied/);
    await assert.rejects(sql("UPDATE account_security.accounts SET status='active'"), /permission denied/);
    await db.exec('RESET ROLE');
    for (const role of ['anon','authenticated']) {
        await db.exec('SET ROLE ' + role);
        await assert.rejects(sql('SELECT * FROM account_security.accounts'), /permission denied/);
        await assert.rejects(sql('SELECT * FROM account_security.session_assurances'), /permission denied/);
        await db.exec('RESET ROLE');
    }

    // Changing the public profile cannot grant or change the protected identity.
    await sql("UPDATE public.users SET name='attacker', password='attacker'");
    assert.equal((await decision(200, 'retain')).profileId, profileId);
    await sql("UPDATE account_security.accounts SET mapping_verified=false"); await decision(403, 'blocked');
    await sql("UPDATE account_security.accounts SET mapping_verified=true, must_change_password=true"); await decision(403, 'blocked');
    await sql("UPDATE account_security.accounts SET must_change_password=false, credential_version=2"); await decision(401, 'reauth');
    await sql('UPDATE account_security.accounts SET credential_version=1');
    await sql("UPDATE account_security.session_assurances SET status='revoked'"); await decision(401, 'reauth');
    await sql("UPDATE account_security.session_assurances SET status='trusted', valid_until=now()-interval '1 second'"); await decision(401, 'reauth');
    await sql("UPDATE account_security.session_assurances SET valid_until=now()+interval '1 hour'");
    // Provider revocation/banning is authoritative through /auth/v1/user.
    authStatus=401;await decision(401,'reauth');authStatus=200;

    for (const status of [401,403]) { authStatus = status; await decision(401, 'reauth'); }
    for (const status of [429,500,503]) {
        authStatus = status;
        const response = await service(request()); assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {error: 'temporarily_unavailable'});
        assert.equal(connected, released);
    }
    authStatus = 200; authUser = {id: otherId, is_anonymous: false}; await decision(401, 'reauth');
    authUser = {id: authId, is_anonymous: true}; await decision(401, 'reauth');
    authUser = {id: authId, is_anonymous: false};

    const malformed = [jwt({...claims, iss:'https://other.invalid/auth/v1'}), jwt({...claims, role:'service_role'}),
        jwt({...claims, exp:0}), jwt({...claims, session_id:null}), 'not-a-jwt'];
    for (const value of malformed) {
        const calls = upstreamCalls;
        assert.equal((await service(request({headers:{...baseHeaders, authorization:'Bearer '+value}}))).status,401);
        assert.equal(upstreamCalls,calls);
    }
    for (const [options, status] of [
        [{method:'GET',body:undefined},405], [{headers:{...baseHeaders,origin:'https://evil.invalid'}},403],
        [{headers:{...baseHeaders,authorization:''}},401], [{headers:{...baseHeaders,'content-type':'text/plain'}},415],
        [{body:'{'},400], [{body:JSON.stringify({action:'session-status',protocol:1,profileId:otherId})},400],
        [{body:'x'.repeat(2049)},413]]) {
        const count=connected;
        assert.equal((await service(request(options))).status,status);
        assert.equal(connected,count,'bad input rejected before database access');
    }
    const preflight=await service(request({method:'OPTIONS',body:undefined}));
    assert.equal(preflight.status,204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'http://localhost:5173');
    assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
    assert.throws(()=>createSessionStatusHandler({assess:()=>{},allowedOrigins:['*']}));

    // A missing schema/dependency remains 503, never a false "no session".
    await db.exec('ALTER TABLE account_security.accounts RENAME TO unavailable_accounts');
    assert.equal((await service(request())).status,503); assert.equal(connected,released);
    await db.exec('ALTER TABLE account_security.unavailable_accounts RENAME TO accounts');
    const timeoutHandler=createSessionStatusHandler({assess:()=>new Promise(()=>{}),timeoutMs:15});
    assert.equal((await timeoutHandler(request({headers:{...baseHeaders,origin:''}}))).status,503);
    let bodyCancelled=false;
    const stalledBody=new ReadableStream({start(){},cancel(){bodyCancelled=true;}});
    assert.equal((await timeoutHandler(request({headers:{...baseHeaders,origin:''},body:stalledBody,duplex:'half'}))).status,503);
    assert.equal(bodyCancelled,true,'a stalled request body is cancelled at its deadline');
    const leaking=createSessionStatusHandler({assess:async()=>({...retained,password:'secret',access_token:'secret'})});
    const safe=await leaking(request({headers:{...baseHeaders,origin:''}}));
    assert.ok(!(await safe.text()).includes('secret'));
    assert.throws(()=>createVerifiedSessionReader({supabaseUrl:'https://user:pass@example.invalid',publishableKey:'key',loadLiveSession:()=>{}}));

    // Actual TCP/HTTP, actual client transport/coordinator, actual SQL store.
    // Only the upstream Supabase Auth response is mocked.
    server=createServer(async(incoming,outgoing)=>{
        try {
            const req=new Request('http://127.0.0.1/session',{method:incoming.method,headers:incoming.headers,
                body:['GET','HEAD'].includes(incoming.method)?undefined:Readable.toWeb(incoming),duplex:'half'});
            const res=await service(req); outgoing.writeHead(res.status,Object.fromEntries(res.headers));
            outgoing.end(await res.text());
        } catch { outgoing.writeHead(500); outgoing.end('{}'); }
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const endpoint='http://127.0.0.1:'+server.address().port+'/session';
    coordinator=createSessionCoordinator({auth:{getSession:async()=>({data:{session:{user:{id:authId},access_token:token,expires_at:claims.exp}}})},
        expectedProfileId:profileId,resolveSession:createSessionTransport({endpoint,publishableKey:'fixture-key'})});
    assert.equal((await coordinator.check()).phase,'ready');
    await sql("UPDATE account_security.session_assurances SET status='revoked'");
    assert.equal((await coordinator.check()).phase,'reauth');
    authStatus=503; assert.equal((await coordinator.check()).phase,'retry');
    assert.equal(connected,released);
    console.log('PASS: real loopback HTTP + client + in-memory PostgreSQL; private roles, parameterized reads, revocation, expiry, reset restriction, malformed input, no secret output, bounded failure and transaction release. Supabase Auth upstream mocked; production untouched.');
} finally {
    coordinator?.stop();
    if(server)await new Promise(resolve=>server.close(resolve));
    await db.close();
}
