import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createProfileUpdateService} from '../supabase/functions/_shared/profileUpdateService.mjs';
import {createProfileReadService} from '../supabase/functions/_shared/profileReadService.mjs';
const db=new PGlite(),query=(sql,args)=>db.query(sql,args);
const p=crypto.randomUUID(),q=crypto.randomUUID(),a=crypto.randomUUID(),s=crypto.randomUUID();
let releases=0,connections=0,afterWrite=null;
const pool={async connect(){connections++;return {async query(sql,args){const result=await query(sql,args);if(sql.startsWith('UPDATE public.users'))await afterWrite?.();return result;},release(){releases++;}};}};
const principal={authUserId:a,sessionId:s,live:true,isAnonymous:false,expiresAt:Date.now()+3600000};let providerActive=true;
const service=createProfileUpdateService({pool,verifyToken:async()=>providerActive?principal:null,readiness:async()=>true});
const readService=createProfileReadService({pool,verifyToken:async()=>providerActive?principal:null,readiness:async()=>true});
const save=(updates,profileId=p,options)=>service({accessToken:'test-token',profileId,updates},options);
const owner=async(fn)=>{await db.exec('RESET ROLE');try{return await fn();}finally{await db.exec('SET ROLE account_profile_worker');}};
try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
        CREATE TABLE public.users(id uuid PRIMARY KEY,name text,gender text,school text,church text,birth text,phone text,
            phone_back4 text,user_group text,status text,guardian_name text,guardian_phone text,guardian_relation text,
            preferences jsonb,bio text,profile_image_url text,role text,password text);
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
        CREATE POLICY legacy_broad ON public.users FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
        CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,banned_until timestamptz);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);`);
    await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-session-foundation.sql',import.meta.url),'utf8'));
    await db.exec(`CREATE TABLE account_security.account_roles(profile_id uuid PRIMARY KEY,role text,enabled boolean);ALTER TABLE account_security.account_roles ENABLE ROW LEVEL SECURITY;GRANT SELECT ON account_security.account_roles TO account_session_reader;CREATE POLICY fixture_roles ON account_security.account_roles FOR SELECT TO account_session_reader USING(true);`);
    await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-profile-foundation.sql',import.meta.url),'utf8'));
    await query(`INSERT INTO public.users(id,school,church,bio,preferences,role,password) VALUES($1,'old','old','old','{"terms":true,"notifications":{"enabled":true},"is_school_church":true}','user','unchanged'),($2,'other','','','{}','admin','other')`,[p,q]);
    await query('INSERT INTO auth.users VALUES($1,false,NULL)',[a]);
    await query('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[s,a]);
    await query("INSERT INTO account_security.accounts VALUES($1,$2,true,'active',1,false)",[p,a]);
    await query("INSERT INTO account_security.account_roles VALUES($1,'staff',true)",[p]);
    await query("INSERT INTO account_security.session_assurances VALUES($1,$2,$3,1,'trusted',now()+interval '1 hour')",[s,a,p]);
    await db.exec('SET ROLE account_profile_worker');
    const own=await readService({accessToken:'test-token',profileId:p});assert.equal(own.profile.role,'staff');
    assert.equal('password' in own.profile,false);assert.equal('auth_user_id' in own.profile,false);
    await assert.rejects(readService({accessToken:'test-token',profileId:q}),e=>e.code==='forbidden');
    const result=await save({school:' 가상고 ',church:'new',bio:'x'.repeat(3000),isSchoolChurch:false});
    assert.equal(result.profile.school,'가상고등학교');assert.equal(result.profile.bio.length,3000);
    assert.equal(result.profile.isSchoolChurch,false);assert.equal('password' in result.profile,false);
    const stored=await owner(()=>query('SELECT * FROM public.users WHERE id=$1',[p]));
    assert.deepEqual(stored.rows[0].preferences,{terms:true,notifications:{enabled:true},is_school_church:false});
    assert.equal(stored.rows[0].password,'unchanged');assert.equal(stored.rows[0].role,'user');
    assert.equal((await query("SELECT current_setting('app.profile_id',true) AS value")).rows[0].value,'');
    await assert.rejects(save({bio:'attack'},q),e=>e.code==='forbidden');
    for(const updates of [{role:'admin'},{password:'new'},{preferences:{}},{isSchoolChurch:'true'}])await assert.rejects(save(updates),e=>e.code==='invalid_request');
    await assert.rejects(query("UPDATE public.users SET role='admin'"),/permission denied/);
    await owner(()=>query(`UPDATE public.users SET preferences=preferences || '{"newSetting":42}'::jsonb WHERE id=$1`,[p]));
    await save({isSchoolChurch:true});
    assert.equal((await owner(()=>query('SELECT preferences FROM public.users WHERE id=$1',[p]))).rows[0].preferences.newSetting,42);
    for(const change of ["status='blocked'","mapping_verified=false","must_change_password=true","credential_version=2"]){
        await owner(()=>query('UPDATE account_security.accounts SET '+change));
        await assert.rejects(save({bio:'denied'}),e=>e.code==='forbidden');
        await owner(()=>query("UPDATE account_security.accounts SET status='active',mapping_verified=true,must_change_password=false,credential_version=1"));
    }
    const before=(await owner(()=>query('SELECT bio FROM public.users WHERE id=$1',[p]))).rows[0].bio;
    afterWrite=()=>{throw new Error('simulated internal failure');};
    await assert.rejects(save({bio:'rollback'}),e=>e.code==='temporarily_unavailable');afterWrite=null;
    assert.equal((await owner(()=>query('SELECT bio FROM public.users WHERE id=$1',[p]))).rows[0].bio,before);
    const controller=new AbortController();afterWrite=()=>controller.abort();
    await assert.rejects(save({bio:'aborted'},p,{signal:controller.signal}),e=>e.code==='temporarily_unavailable');afterWrite=null;
    assert.equal((await owner(()=>query('SELECT bio FROM public.users WHERE id=$1',[p]))).rows[0].bio,before);
    providerActive=false;
    await assert.rejects(save({bio:'revoked'}),e=>e.code==='invalid_login');
    assert.equal((await owner(()=>query('SELECT school FROM public.users WHERE id=$1',[q]))).rows[0].school,'other');
    assert.equal(connections,releases);
    console.log('PASS profile update: SQL authorization, scoped grants, preserved preferences, current input lengths, rollback, revoked sessions');
}finally{await db.close();}
