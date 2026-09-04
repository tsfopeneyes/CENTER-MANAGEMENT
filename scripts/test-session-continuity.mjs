import assert from 'node:assert/strict';
import {createSessionCoordinator} from '../src/auth/sessionCoordinator.js';
import {createSessionTransport} from '../src/auth/sessionTransport.js';
import {assessSessionContinuity} from '../supabase/functions/_shared/sessionContinuity.mjs';

// Entirely isolated: no SDK client, environment credentials, DB or real requests.
const authId = '10000000-0000-4000-8000-000000000001';
const profileId = '10000000-0000-4000-8000-000000000002';
const sessionId = '10000000-0000-4000-8000-000000000003';
const otherId = '10000000-0000-4000-8000-000000000004';
const time = 1800000000000;
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const session = {user: {id: authId, is_anonymous: false}, access_token: 'fixture-token', expires_at: time / 1000 + 3600};
const approval = {protocol: 1, decision: 'retain', authUserId: authId, profileId, sessionId, validUntil: time + 60000};
const coordinators = [];
function fixture(options = {}) {
    let callback, reads = 0, serverReads = 0, signouts = 0, stopped = 0;
    let response = {data: {session}};
    let resolver = async () => approval;
    const auth = {
        getSession: async () => { reads++; return response; },
        onAuthStateChange: listener => { callback = listener; return {data: {subscription: {unsubscribe() { stopped++; }}}}; },
        signOut: async () => { signouts++; },
    };
    const c = createSessionCoordinator({auth, expectedProfileId: profileId, now: () => time,
        resolveSession: (...args) => { serverReads++; return resolver(...args); }, ...options});
    coordinators.push(c);
    return {c, setResponse(value) { response = value; }, setResolver(value) { resolver = value; },
        event: value => callback(value), get reads() { return reads; }, get serverReads() { return serverReads; },
        get signouts() { return signouts; }, get stopped() { return stopped; }};
}

try {
    let f = fixture();
    const first = f.c.check();
    assert.equal(first, f.c.check(), 'simultaneous reads share one verification');
    assert.equal((await first).phase, 'ready');
    assert.equal(f.reads, 1); assert.equal(f.serverReads, 1);
    const lease = f.c.captureIdentity();
    f.c.assertCurrent(lease);
    assert.ok(!JSON.stringify(f.c.getSnapshot()).includes('fixture-token'));

    f = fixture(); f.setResponse({data: {session: null}});
    assert.equal((await f.c.check()).phase, 'reauth'); assert.equal(f.serverReads, 0);
    assert.throws(() => f.c.captureIdentity());
    f.setResponse({data: {session: {...session, user: {...session.user, is_anonymous: true}}}});
    assert.equal((await f.c.check()).phase, 'reauth');

    for (const response of [{error: {status: 503}}, {error: {name: 'AuthRetryableFetchError'}},
        {data: {session: {...session, expires_at: time / 1000}}}]) {
        f = fixture(); f.setResponse(response);
        assert.equal((await f.c.check()).phase, 'retry'); assert.equal(f.signouts, 0);
    }
    f = fixture(); f.setResponse({error: {code: 'refresh_token_not_found'}});
    assert.equal((await f.c.check()).phase, 'reauth'); assert.equal(f.signouts, 0);

    for (const [result, phase] of [[{protocol: 1, decision: 'reauth'}, 'reauth'],
        [{protocol: 1, decision: 'blocked'}, 'blocked'], [{...approval, profileId: otherId}, 'blocked'],
        [{...approval, authUserId: otherId}, 'retry'], [{...approval, protocol: 2}, 'retry'],
        [{...approval, validUntil: time}, 'retry'], [{...approval, sessionId: ''}, 'retry']]) {
        f = fixture(); f.setResolver(async () => result);
        assert.equal((await f.c.check()).phase, phase); assert.throws(() => f.c.captureIdentity());
    }
    f = fixture(); f.setResolver(async () => { throw Error('offline'); });
    assert.equal((await f.c.check()).phase, 'retry'); assert.equal(f.signouts, 0);
    f.setResolver(async () => approval);
    assert.equal((await f.c.check()).phase, 'ready', 'recovery without signout');

    const waiting = deferred(); f = fixture(); f.setResolver(() => waiting.promise);
    const old = f.c.check(); await tick();
    f.c.setExpectedProfile(otherId);
    waiting.resolve(approval); await old;
    assert.notEqual(f.c.getSnapshot().phase, 'ready', 'late prior-account response cannot restore access');
    assert.equal((await f.c.check()).phase, 'blocked');

    const slow = deferred(); f = fixture({timeoutMs: 15}); f.setResolver(() => slow.promise);
    assert.equal((await f.c.check()).phase, 'retry');
    slow.resolve(approval); await tick();
    assert.equal(f.c.getSnapshot().phase, 'retry', 'late timeout completion cannot restore access');

    f = fixture(); f.c.start(); await tick();
    const prior = f.c.captureIdentity();
    f.event('TOKEN_REFRESHED');
    assert.throws(() => f.c.assertCurrent(prior), 'old request invalidated immediately on refresh event');
    await tick(); assert.equal(f.c.getSnapshot().phase, 'ready');
    f.event('SIGNED_OUT'); assert.equal(f.c.getSnapshot().phase, 'reauth');
    await tick(); assert.equal(f.c.getSnapshot().phase, 'reauth');
    f.c.stop(); assert.equal(f.stopped, 1);

    let clock = time;
    f = fixture({now: () => clock}); await f.c.check();
    const captured = f.c.captureIdentity(); clock += 60001;
    assert.throws(() => f.c.captureIdentity()); assert.throws(() => f.c.assertCurrent(captured));

    // Renewed proof must not resurrect an action's expired identity capture.
    f.setResolver(async()=>({...approval,validUntil:clock+60000}));
    await f.c.check();assert.equal(f.c.getSnapshot().phase,'ready');
    assert.throws(()=>f.c.assertCurrent(captured),'old capture stays expired after a successful recheck');

    // Actual timer expiration invalidates ready even without SDK events.
    f = fixture({now: Date.now});
    f.setResponse({data: {session: {...session, expires_at: Date.now() / 1000 + 60}}});
    f.setResolver(async () => ({...approval, validUntil: Date.now() + 15}));
    await f.c.check(); await new Promise(resolve => setTimeout(resolve, 30));
    assert.notEqual(f.c.getSnapshot().phase, 'ready');

    const principal = {authUserId: authId, sessionId, isAnonymous: false, live: true, expiresAt: time + 3600000};
    const account = {authUserId: authId, profileId, mappingVerified: true, status: 'active', credentialVersion: 2, mustChangePassword: false};
    const evidence = {authUserId: authId, profileId, sessionId, credentialVersion: 2, status: 'trusted', validUntil: time + 3600000};
    const deps = {verifyToken: async () => principal, loadAccount: async () => account,
        loadAssurance: async () => evidence, now: () => time};
    const assess = overrides => assessSessionContinuity('fixture-token', {...deps, ...overrides});
    assert.deepEqual(await assess(), {...approval, reason: 'verified'});
    assert.equal((await assess({loadAssurance: async () => null})).decision, 'reauth', 'valid JWT alone is insufficient');
    assert.equal((await assess({loadAccount: async () => ({...account, mappingVerified: false})})).decision, 'blocked');
    assert.equal((await assess({loadAccount: async () => ({...account, mustChangePassword: true})})).decision, 'blocked');
    assert.equal((await assess({loadAccount: async () => ({...account, mustChangePassword: undefined})})).decision, 'blocked');
    for (const altered of [null, {...principal, live: false}, {...principal, isAnonymous: true}, {...principal, expiresAt: time}]) {
        assert.equal((await assess({verifyToken: async () => altered})).decision, 'reauth');
    }
    for (const altered of [{...evidence, sessionId: otherId}, {...evidence, authUserId: otherId},
        {...evidence, profileId: otherId}, {...evidence, status: 'revoked'},
        {...evidence, credentialVersion: 1}]) {
        assert.equal((await assess({loadAssurance: async () => altered})).decision, 'reauth');
    }
    assert.equal((await assess({loadAssurance: async () => ({...evidence, validUntil: time - 1})})).decision, 'retain',
        'a previously verified live provider session must not require the password again each day');
    await assert.rejects(assess({loadAccount: async () => { throw Error('DB unavailable'); }}));

    for (const status of [401, 403, 404, 429, 503]) {
        let calls = 0;
        const transport = createSessionTransport({endpoint: 'https://example.invalid/session', publishableKey: 'fixture-key',
            fetcher: async (_url, options) => {
                calls++; assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
                assert.equal(options.headers.Authorization, 'Bearer fixture-token');
                assert.deepEqual(JSON.parse(options.body), {action: 'session-status', protocol: 1});
                return new Response('{}', {status});
            }});
        const request = transport('fixture-token', {signal: new AbortController().signal});
        if (status === 401 || status === 403) assert.equal((await request).decision, status === 401 ? 'reauth' : 'blocked');
        else await assert.rejects(request);
        assert.equal(calls, 1, 'no retry loops');
    }
    assert.throws(() => createSessionTransport({endpoint: 'http://example.invalid/session'}));
    console.log('PASS: trusted continuity, missing/untrusted/revoked sessions, mapping conflicts, password-reset restriction, network recovery, bounded waits, stale responses, expiry, SDK events and no mutation/retry/signout.');
} finally {
    for (const c of coordinators) c.stop();
}
