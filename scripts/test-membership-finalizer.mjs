import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createMembershipFinalizer} from '../supabase/functions/_shared/membershipFinalizer.mjs';
import {createRegistrationFormValidator} from '../supabase/functions/_shared/registrationForm.mjs';
import {createLoginKey} from '../supabase/functions/_shared/loginSecurity.mjs';
import {TERMS_VERSION} from '../src/constants/appConstants.js';

const db=new PGlite();const query=(sql,args)=>db.query(sql,args);
const validateForm=createRegistrationFormValidator({termsVersion:TERMS_VERSION,now:()=>Date.parse('2026-08-31T03:00:00Z')});
const keyFor=await createLoginKey('fixture-only-membership-key-never-production-12345');
let connections=0,releases=0,failure=null;
const pool={async connect(){connections++;return {async query(sql,args){
    const result=await query(sql,args);
    if(failure && sql.includes(failure)){failure=null;throw Error('injected post-statement failure');}
    return result;
},release(){releases++;}};}};
const principals=new Map();
const deps={pool,keyFor,validateForm,readiness:async()=>true,verifyToken:async(token)=>principals.get(token)};
const finalize=createMembershipFinalizer(deps);
const admin=async(work)=>{await db.exec('RESET ROLE');try{return await work();}finally{await db.exec('SET ROLE account_membership_worker');}};
let n=0;
const prepare=async({birth='100101',phone,authId,name,guestUserId}={})=>{
    n++;const id=crypto.randomUUID(),uid=authId||crypto.randomUUID(),sid=crypto.randomUUID();
    const requestSecret=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const accessToken='fixture-session-'+n;
    const submission={termsVersion:TERMS_VERSION,agreements:{art1:true,art2:true,art3:true,art4:true},formData:{
        name:name||'가상회원'+n,gender:'M',school:'가상중',church:'',birth,phone:phone||'010'+String(n).padStart(8,'0'),
        user_group:'청소년',password:'123456',confirmPassword:'123456',guardianName:'보호자',guardianPhone:'01099998888',
        guardianRelation:'부',isSchoolChurch:false}};
    if(guestUserId)submission.guestUserId=guestUserId;
    const detailsKey=await keyFor('registration-details',validateForm(submission).canonicalDetails);
    await admin(async()=>{
        await query('INSERT INTO auth.users VALUES($1,$2,$3,false,NULL)',[uid,id+'@fixture.invalid',{registration_operation:id}]);
        await query('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[sid,uid]);
        await query(`INSERT INTO account_security.registration_operations
            (id,request_key,identity_key,details_key,login_email,state,auth_user_id,valid_until,ready_at)
            VALUES($1,$2,$3,$4,$5,'auth_ready',$6,clock_timestamp()+interval '1 hour',clock_timestamp())`,
            [id,await keyFor('registration-request',requestSecret),await keyFor('fixture-identity',String(n)),detailsKey,id+'@fixture.invalid',uid]);
    });
    principals.set(accessToken,{authUserId:uid,sessionId:sid,live:true,isAnonymous:false,expiresAt:Date.now()+3600000});
    return {operationId:id,requestSecret,submission,accessToken};
};
const inspect=async(input)=>admin(async()=>{
    const id=principals.get(input.accessToken).authUserId;
    return {
        profile:(await query('SELECT * FROM public.users WHERE id=$1',[id])).rows[0],
        account:(await query('SELECT * FROM account_security.accounts WHERE profile_id=$1',[id])).rows[0],
        login:(await query('SELECT * FROM account_security.login_identifiers WHERE profile_id=$1',[id])).rows[0],
        receipt:(await query('SELECT * FROM account_security.membership_receipts WHERE operation_id=$1',[input.operationId])).rows[0]
    };
});
const rejected=(input,code)=>assert.rejects(finalize(input),e=>e.code===code);
try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb,is_anonymous boolean,banned_until timestamptz);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
        CREATE TABLE public.users(id uuid PRIMARY KEY,auth_user_id uuid UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),name text NOT NULL,gender text,school text,church text,birth text,phone text NOT NULL,phone_back4 text NOT NULL,
            user_group text,role text,status text,guardian_name text,guardian_phone text,guardian_relation text,preferences jsonb,password text,memo text);
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
        CREATE TABLE public.raw_logs(id integer PRIMARY KEY,content text);
        INSERT INTO public.raw_logs VALUES(1,'original-log');
        INSERT INTO public.users(id,name,phone,phone_back4,role,password) VALUES('10000000-0000-4000-8000-000000000001','existing','010-1111-2222','2222','user','existing-hash');`);
    for(const file of ['auth-session-foundation','auth-login-foundation','auth-registration-foundation','auth-membership-foundation']){
        await db.exec(readFileSync(new URL('../supabase/manual/proposals/'+file+'.sql',import.meta.url),'utf8'));
    }
    const original=(await query("SELECT * FROM public.users WHERE name='existing'")).rows;
    await db.exec('SET ROLE account_membership_worker');
    const normal=await prepare();
    assert.deepEqual(await finalize(normal),{protocol:1,status:'registered'});
    const saved=await inspect(normal);
    assert.equal(saved.profile.password,null);assert.equal(saved.profile.role,'user');
    assert.equal(saved.profile.id,principals.get(normal.accessToken).authUserId);
    assert.equal(saved.profile.auth_user_id,saved.account.auth_user_id);
    assert.equal(saved.account.status,'active');assert.equal(saved.account.mapping_verified,true);
    assert.equal(saved.login.enabled,true);assert.equal(saved.login.phone_key,await keyFor('phone',normal.submission.formData.phone));
    assert.ok(saved.receipt);assert.equal(saved.profile.school,'가상중학교');
    // Replays cannot undo later member edits or blocking.
    await admin(async()=>{
        await query("UPDATE public.users SET name='admin edited' WHERE id=$1",[saved.profile.id]);
        await query("UPDATE account_security.accounts SET status='blocked' WHERE profile_id=$1",[saved.profile.id]);
    });
    assert.deepEqual(await finalize(normal),{protocol:1,status:'registered'});
    assert.equal((await inspect(normal)).profile.name,'admin edited');assert.equal((await inspect(normal)).account.status,'blocked');
    await rejected({...normal,requestSecret:'a'.repeat(43)},'registration_review_required');
    const changed=structuredClone(normal);changed.submission.formData.name='changed';
    await rejected(changed,'registration_review_required');
    const child=await prepare({birth:'150101'});
    assert.deepEqual(await finalize(child),{protocol:1,status:'registered'});
    const childState=await inspect(child);
    // Keep the existing public guardian/status fields, but do not invent a new
    // authentication approval gate that the current operation does not use.
    assert.equal(childState.profile.status,'pending');assert.equal(childState.account.status,'active');assert.equal(childState.login.enabled,true);
    const guestId=crypto.randomUUID();
    await admin(()=>query(`INSERT INTO public.users(id,name,birth,phone,phone_back4,user_group,role,status,preferences,password,memo)
        VALUES($1,'기존게스트(guest)','100101','010-3333-4444','4444','게스트','user','approved','{"is_temporary":true}',NULL,'기존 메모')`,[guestId]));
    const guestUpgrade=await prepare({guestUserId:guestId,name:'기존게스트',birth:'100101',phone:'01033334444'});
    assert.deepEqual(await finalize(guestUpgrade),{protocol:1,status:'registered'});
    const upgraded=(await admin(()=>query('SELECT * FROM public.users WHERE id=$1',[guestId]))).rows[0];
    assert.equal(upgraded.auth_user_id,principals.get(guestUpgrade.accessToken).authUserId);assert.equal(upgraded.password,null);
    assert.equal(upgraded.user_group,'청소년');assert.match(upgraded.memo,/기존 메모[\s\S]*자동병합/);
    assert.equal((await admin(()=>query('SELECT count(*)::int AS n FROM account_security.accounts WHERE profile_id=$1',[guestId]))).rows[0].n,1);
    const autoGuestId=crypto.randomUUID();
    await admin(()=>query(`INSERT INTO public.users(id,name,birth,phone,phone_back4,user_group,role,status,preferences,password,memo)
        VALUES($1,'자동게스트','100101','010-5555-6666','6666','미가입','user','approved','{"is_temporary":true}',NULL,'방문 기록')`,[autoGuestId]));
    const autoGuest=await prepare({name:'자동게스트',birth:'100101',phone:'01055556666'});
    assert.equal((await query(`SELECT count(*)::int AS n FROM public.users u LEFT JOIN account_security.accounts a ON a.profile_id=u.id
        WHERE a.profile_id IS NULL AND u.auth_user_id IS NULL AND trim(u.name)=$1 AND u.birth=$2
        AND regexp_replace(COALESCE(u.phone,''),'[^0-9]','','g')=$3
        AND (u.preferences->>'is_temporary'='true' OR u.user_group IN ('게스트','미가입'))`,
        ['자동게스트','100101','01055556666'])).rows[0].n,1);
    assert.deepEqual(await finalize(autoGuest),{protocol:1,status:'registered'});
    const autoUpgraded=(await admin(()=>query('SELECT * FROM public.users WHERE id=$1',[autoGuestId]))).rows[0];
    assert.equal(autoUpgraded.auth_user_id,principals.get(autoGuest.accessToken).authUserId);
    assert.equal((await admin(()=>query('SELECT count(*)::int AS n FROM public.users WHERE auth_user_id=$1',
        [principals.get(autoGuest.accessToken).authUserId]))).rows[0].n,1);
    assert.deepEqual(await finalize(autoGuest),{protocol:1,status:'registered'});
    const ambiguousIds=[crypto.randomUUID(),crypto.randomUUID()];
    await admin(async()=>{for(const [index,id] of ambiguousIds.entries())await query(`INSERT INTO public.users
        (id,name,birth,phone,phone_back4,user_group,role,status,preferences,password)
        VALUES($1,$2,'100101','010-7777-8888','8888','게스트','user','approved','{"is_temporary":true}',NULL)`,
        [id,'다른게스트'+index]);});
    const ambiguous=await prepare({name:'정상가입자',birth:'100101',phone:'01077778888'});
    assert.deepEqual(await finalize(ambiguous),{protocol:1,status:'registered'});
    const ambiguousProfile=await inspect(ambiguous);assert.ok(ambiguousProfile.profile);
    const review=(await admin(()=>query('SELECT * FROM account_security.guest_link_reviews WHERE operation_id=$1',
        [ambiguous.operationId]))).rows[0];
    assert.equal(review.new_profile_id,principals.get(ambiguous.accessToken).authUserId);
    assert.deepEqual(new Set(review.candidate_profile_ids),new Set(ambiguousIds));assert.equal(review.status,'pending');
    // Every write-stage failure rolls ALL new rows back; retry completes once.
    for(const stage of ['INSERT INTO public.users','INSERT INTO account_security.accounts',
        'INSERT INTO account_security.login_identifiers','INSERT INTO account_security.membership_receipts']) {
        const input=await prepare();failure=stage;
        await rejected(input,'temporarily_unavailable');
        assert.deepEqual(await inspect(input),{profile:undefined,account:undefined,login:undefined,receipt:undefined});
        assert.deepEqual(await finalize(input),{protocol:1,status:'registered'});
    }
    const lost=await prepare();failure='COMMIT';await rejected(lost,'temporarily_unavailable');
    const before=await inspect(lost);assert.ok(before.receipt);
    assert.deepEqual(await finalize(lost),{protocol:1,status:'registered'});assert.deepEqual(await inspect(lost),before);
    const duplicate=await prepare({phone:'01011112222'});await rejected(duplicate,'registration_review_required');
    assert.equal((await inspect(duplicate)).profile,undefined);
    const expired=await prepare();await admin(()=>query("UPDATE account_security.registration_operations SET valid_until=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.operationId]));
    await rejected(expired,'registration_review_required');
    const revoked=await prepare();principals.delete(revoked.accessToken);
    await rejected(revoked,'invalid_login');
    const injected=await prepare();injected.submission.formData.role='admin';await rejected(injected,'invalid_registration');
    // Existing trigger/default behavior cannot silently put a password back into
    // the public member row. RLS checks the post-trigger row and rolls back.
    await admin(()=>db.exec(`CREATE POLICY fixture_legacy_permissive ON public.users FOR INSERT TO PUBLIC WITH CHECK(true);
        CREATE FUNCTION public.fixture_legacy_password() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN NEW.password='fixture-legacy-hash'; RETURN NEW; END $$;
        CREATE TRIGGER fixture_legacy_password BEFORE INSERT ON public.users
        FOR EACH ROW EXECUTE FUNCTION public.fixture_legacy_password();`));
    const legacyTrigger=await prepare();await rejected(legacyTrigger,'temporarily_unavailable');
    assert.equal((await inspect(legacyTrigger)).profile,undefined);
    await admin(()=>db.exec('DROP TRIGGER fixture_legacy_password ON public.users'));
    await assert.rejects(createMembershipFinalizer({...deps,readiness:undefined})(normal),e=>e.code==='temporarily_unavailable');
    assert.equal((await query("UPDATE public.users SET name='bad' RETURNING id")).rows.length,0);
    await assert.rejects(query('SELECT password FROM public.users'),/permission denied/);
    await assert.rejects(query("INSERT INTO public.users(id,password) VALUES($1,'bad')",[crypto.randomUUID()]),/permission denied/);
    await assert.rejects(query('DELETE FROM account_security.membership_receipts'),/permission denied/);
    await assert.rejects(query("UPDATE auth.users SET email='bad'"),/permission denied/);
    assert.equal(connections,releases);
    await db.exec('RESET ROLE');
    assert.deepEqual((await query("SELECT * FROM public.users WHERE name='existing'")).rows,original);
    assert.deepEqual((await query('SELECT * FROM public.raw_logs')).rows,[{id:1,content:'original-log'}]);
    for(const role of ['anon','authenticated']){
        await db.exec('SET ROLE '+role);await assert.rejects(query('SELECT * FROM account_security.membership_receipts'),/permission denied/);
        await db.exec('RESET ROLE');
    }
    console.log('PASS membership finalization: atomic profile/auth linkage, every-stage rollback, lost COMMIT recovery, no invented approval gate, guardian data preserved, duplicate refusal, private permissions, preserved members/logs');
}finally{await db.close();}
