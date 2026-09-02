import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createRegistrationStore} from '../supabase/functions/_shared/registrationStore.mjs';
import {createRegistrationService} from '../supabase/functions/_shared/registrationService.mjs';
import {createLoginKey,LoginError} from '../supabase/functions/_shared/loginSecurity.mjs';

const db=new PGlite();
const query=(sql,args)=>db.query(sql,args);
const store=createRegistrationStore({query});
const keyFor=await createLoginKey('isolated-fixture-key-not-real-secret-0123456789');
const passwords=new Map(),tokens=new Map();
let creates=0,loss=false,providerReject=false,readyLoss=false,wrongProof=false,allowed=true,policy=true,quota=true;
let readyHook;
const privileged=async(work)=>{
    await db.exec('RESET ROLE');
    try{return await work();}finally{await db.exec('SET ROLE account_registration_worker');}
};
const adminAuth={async createUser(attributes){
    creates++;
    assert.deepEqual(Object.keys(attributes).sort(),['app_metadata','email','email_confirm','password']);
    assert.equal(attributes.email_confirm,true);
    if(providerReject)return {error:{message:'fixture rejection'}};
    const id=crypto.randomUUID();
    await privileged(()=>query('INSERT INTO auth.users VALUES($1,$2,$3,false)',[id,attributes.email,attributes.app_metadata]));
    passwords.set(attributes.email,{id,password:attributes.password});
    if(loss)throw Error('create response lost after durable Auth insert');
    return {data:{user:{id}},error:null};
},async findUserByEmail(email,operation){
    const result=await privileged(()=>query(`SELECT id,email,raw_app_meta_data AS app_metadata,is_anonymous
        FROM auth.users WHERE email=$1 AND raw_app_meta_data->>'registration_operation'=$2`,[email,operation]));
    return {data:{user:result.rows.length===1?result.rows[0]:null},error:null};
}};
const gateway={async signIn(email,password){
    const user=passwords.get(email);
    if(!user || user.password!==password)throw new LoginError('invalid_login',401);
    const token=crypto.randomUUID();tokens.set(token,user.id);
    return {access_token:token,user:{id:user.id}};
},async discardCreatedSession(token){assert.ok(tokens.delete(token));}};
const deps={store:{...store,async markReady(op,id){
    if(readyHook)await readyHook(op,id);
    await store.markReady(op,id);
    if(readyLoss)throw Error('ready UPDATE response lost');
}},limits:{async consumeLimit(){return quota;}},keyFor,adminAuth,gateway,
    async verifyToken(token){return {authUserId:wrongProof?crypto.randomUUID():tokens.get(token),sessionId:crypto.randomUUID(),
        live:true,isAnonymous:false,expiresAt:Date.now()+3600000};},
    async verifyEnrollment({enrollmentId,details}){return {allowed,enrollmentId,identity:details.phone,
        canonicalDetails:JSON.stringify({name:details.name,phone:details.phone}),validUntil:Date.now()+60000};},
    passwordPolicy:async()=>policy,readiness:async()=>true,loginDomain:'registration.example.invalid',lifetimeMs:3600000};
const service=createRegistrationService(deps);
const fixture=(n)=>({protocol:1,requestSecret:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
    enrollmentId:crypto.randomUUID(),password:'fixture native password '+n,details:{name:'fixture '+n,phone:'verified-contact-'+n}});
const ctx={clientKey:'trusted-ingress-fixture'};
const invoke=(input)=>service(input,ctx);
const rejected=(input,code)=>assert.rejects(invoke(input),e=>e.code===code);
try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA account_security;
        REVOKE ALL ON SCHEMA account_security FROM PUBLIC;
        CREATE TABLE public.users(id uuid PRIMARY KEY,name text);
        INSERT INTO public.users VALUES('10000000-0000-4000-8000-000000000001','existing member unchanged');
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb,is_anonymous boolean);`);
    await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-registration-foundation.sql',import.meta.url),'utf8'));
    await db.exec('SET ROLE account_registration_worker');
    const one=fixture(1);
    allowed=false;await rejected(one,'registration_review_required');allowed=true;
    policy=false;await rejected(one,'password_policy');policy=true;
    quota=false;await rejected(one,'try_later');quota=true;
    await assert.rejects(createRegistrationService({...deps,readiness:undefined})(one,ctx),e=>e.code==='temporarily_unavailable');
    assert.equal(creates,0);
    assert.deepEqual(await invoke(one),{protocol:1,status:'membership_pending'});
    const first=(await query('SELECT * FROM account_security.registration_operations')).rows[0];
    const createdAt=first.created_at,validUntil=first.valid_until;
    assert.equal(first.state,'auth_ready');assert.equal(creates,1);assert.equal(tokens.size,0);
    assert.deepEqual(await invoke(one),{protocol:1,status:'membership_pending'});assert.equal(creates,1);
    const repeated=(await query('SELECT * FROM account_security.registration_operations')).rows[0];
    assert.deepEqual(repeated.created_at,createdAt);assert.deepEqual(repeated.valid_until,validUntil);
    await rejected({...one,password:'wrong native password'},'invalid_login');assert.equal(creates,1);
    await rejected({...one,details:{...one.details,name:'changed submission'}},'registration_review_required');
    await rejected({...one,requestSecret:fixture(2).requestSecret},'registration_review_required');
    // Lost create response is recovered, without a second Auth create call.
    const two=fixture(2);loss=true;await rejected(two,'temporarily_unavailable');loss=false;
    const beforeRecovery=creates;
    await rejected({...two,password:'wrong native password'},'invalid_login');
    assert.deepEqual(await invoke(two),{protocol:1,status:'membership_pending'});assert.equal(creates,beforeRecovery);
    // A definite provider rejection is not automatically retried either.
    const three=fixture(3);providerReject=true;await rejected(three,'temporarily_unavailable');providerReject=false;
    const beforeRetry=creates;await rejected(three,'registration_pending');assert.equal(creates,beforeRetry);
    // Matching email without protected operation metadata is not adopted.
    const third=(await query("SELECT * FROM account_security.registration_operations WHERE state='creating'")).rows[0];
    await privileged(()=>query('INSERT INTO auth.users VALUES($1,$2,$3,false)',[crypto.randomUUID(),third.login_email,{}]));
    await rejected(three,'registration_pending');
    const four=fixture(4);readyLoss=true;await rejected(four,'temporarily_unavailable');readyLoss=false;
    const beforeReadyRetry=creates;
    assert.deepEqual(await invoke(four),{protocol:1,status:'membership_pending'});assert.equal(creates,beforeReadyRetry);
    wrongProof=true;await rejected(four,'invalid_login');wrongProof=false;
    // Provider binding is checked through the official Admin API before the
    // durable ready transition; the DB worker no longer reads auth internals.
    const five=fixture(5);readyHook=(op)=>privileged(()=>query("UPDATE auth.users SET raw_app_meta_data='{}' WHERE email=$1",[op.loginEmail]));
    assert.deepEqual(await invoke(five),{protocol:1,status:'membership_pending'});readyHook=null;
    assert.equal(tokens.size,0);
    // Expired attempts retain identity claims and never create a replacement.
    await query("UPDATE account_security.registration_operations SET valid_until=clock_timestamp()-interval '1 second' WHERE id=$1",[first.id]);
    const beforeExpiry=creates;await rejected(one,'registration_review_required');assert.equal(creates,beforeExpiry);
    // Direct atomic claim race: only one of 20 calls receives create permission.
    const race=await store.reserve({id:crypto.randomUUID(),requestKey:'a'.repeat(64),identityKey:'b'.repeat(64),detailsKey:'c'.repeat(64),
        loginEmail:'race@registration.example.invalid',lifetimeMs:60000});
    const claims=await Promise.all(Array.from({length:20},()=>store.claim(race)));
    assert.equal(claims.filter(Boolean).length,1);
    // Commit of the create claim succeeds, but its response never reaches the
    // service: don't guess that create is safe on a subsequent attempt.
    const six=fixture(6);
    const lostClaimService=createRegistrationService({...deps,store:{...deps.store,async claim(op){
        await store.claim(op);throw Error('lost claim response');
    }}});
    const beforeLostClaim=creates;
    await assert.rejects(lostClaimService(six,ctx),e=>e.code==='temporarily_unavailable');
    await rejected(six,'registration_pending');assert.equal(creates,beforeLostClaim);
    const controller=new AbortController();controller.abort();
    await assert.rejects(service(fixture(7),{...ctx,signal:controller.signal}),e=>e.code==='temporarily_unavailable');
    assert.equal(creates,beforeLostClaim);
    let finalized=0;
    const wired=createRegistrationService({...deps,async finalizeMembership(input){
        finalized++;
        assert.ok(tokens.has(input.accessToken));
        assert.equal(input.requestSecret,four.requestSecret);
        assert.deepEqual(input.submission,four.details);
        assert.ok(input.operationId);
        return {protocol:1,status:'registered',internal:'must not leave server'};
    }});
    assert.deepEqual(await wired(four,ctx),{protocol:1,status:'registered'});
    assert.equal(finalized,1);assert.equal(tokens.size,0);
    const failedFinalizer=createRegistrationService({...deps,async finalizeMembership(){throw Error('fixture finalization failure');}});
    await assert.rejects(failedFinalizer(four,ctx),e=>e.code==='temporarily_unavailable');
    assert.equal(tokens.size,0);
    await assert.rejects(query("UPDATE public.users SET name='bad'"),/permission denied/);
    await assert.rejects(query("UPDATE auth.users SET email='bad'"),/permission denied/);
    await assert.rejects(query('DELETE FROM account_security.registration_operations'),/permission denied/);
    const serialized=JSON.stringify((await query('SELECT * FROM account_security.registration_operations')).rows);
    assert.ok(!serialized.includes(one.password) && !serialized.includes(one.requestSecret) && !serialized.includes(one.details.phone));
    await db.exec('RESET ROLE');
    assert.deepEqual((await query('SELECT name FROM public.users')).rows,[{name:'existing member unchanged'}]);
    for(const role of ['anon','authenticated']){
        await db.exec('SET ROLE '+role);
        await assert.rejects(query('SELECT * FROM account_security.registration_operations'),/permission denied/);
        await db.exec('RESET ROLE');
    }
    console.log('PASS registration preparation: single create claim, lost create/ready responses, password-bound recovery, no email adoption, expiry, private grants, preserved members');
} finally {await db.close();}
