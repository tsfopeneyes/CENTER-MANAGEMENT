import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createRoleBoundPool} from '../supabase/functions/_shared/roleBoundPool.mjs';
import {createAccountMergeService} from '../supabase/functions/_shared/accountMergeService.mjs';

const db=new PGlite(),query=(text,values)=>db.query(text,values);
const base={async connect(){return {query,release(){}};}};
const actor='10000000-0000-4000-8000-000000000001',source='10000000-0000-4000-8000-000000000002';
const target='10000000-0000-4000-8000-000000000003';
const authIds=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003'];
try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,is_anonymous boolean,banned_until timestamptz);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
      CREATE TABLE public.users(id uuid PRIMARY KEY,auth_user_id uuid UNIQUE,name text NOT NULL,phone text NOT NULL,phone_back4 text NOT NULL,
        birth text,user_group text,preferences jsonb,current_haifn numeric,school text,password text,gender text,church text,role text,status text,
        guardian_name text,guardian_phone text,guardian_relation text,bio text,profile_image_url text,is_master boolean,memo text);
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;CREATE POLICY broad_users ON public.users FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
      CREATE TABLE public.logs(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id));ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public.notice_responses(notice_id uuid,user_id uuid REFERENCES public.users(id),status text,PRIMARY KEY(notice_id,user_id));ALTER TABLE public.notice_responses ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public.school_logs(id uuid PRIMARY KEY,participant_ids uuid[]);ALTER TABLE public.school_logs ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public.calling_forest_progress(id uuid PRIMARY KEY,student_id uuid REFERENCES public.users(id),week_number int,UNIQUE(student_id,week_number));ALTER TABLE public.calling_forest_progress ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public.unreviewed_reference(id uuid PRIMARY KEY,user_id uuid REFERENCES public.users(id));`);
    for(const name of ['session','login','migration','credential','registration','membership','roles','bootstrap','profile','member-admin','account-merge'])
        await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-'+name+'-foundation.sql',import.meta.url),'utf8'));
    const admin=async work=>{await db.exec('RESET ROLE');try{return await work();}finally{}};
    await query('INSERT INTO auth.users(id,is_anonymous) VALUES($1,false),($2,false)',authIds);
    await query(`INSERT INTO public.users(id,auth_user_id,name,phone,phone_back4,user_group,preferences,current_haifn,school,role,status)
      VALUES($1,$4,'관리자','010-0000-0001','0001','STAFF','{}',0,'센터','admin','approved'),
      ($2,NULL,'임시','010-0000-0002','0002','게스트','{"is_temporary":true}',5,'기존학교','user','approved'),
      ($3,$5,'정식','010-0000-0003','0003','청소년','{}',10,NULL,'user','approved')`,[actor,source,target,...authIds]);
    await query(`INSERT INTO account_security.accounts(profile_id,auth_user_id,mapping_verified,status,must_change_password)
      VALUES($1,$3,true,'active',false),($2,$4,true,'active',false)`,[actor,target,...authIds]);
    await query("INSERT INTO account_security.account_roles(profile_id,role,enabled) VALUES($1,'admin',true),($2,'member',true)",[actor,target]);
    const notice=crypto.randomUUID();await query('INSERT INTO public.logs VALUES($1,$2)',[crypto.randomUUID(),source]);
    await query("INSERT INTO public.notice_responses VALUES($1,$2,'SOURCE'),($1,$3,'TARGET')",[notice,source,target]);
    await query('INSERT INTO public.school_logs VALUES($1,$2)',[crypto.randomUUID(),[source,target]]);
    await query('INSERT INTO public.calling_forest_progress VALUES($1,$2,1),($3,$4,1)',[crypto.randomUUID(),source,crypto.randomUUID(),target]);
    const service=createAccountMergeService({pool:createRoleBoundPool(base,'account_merge_worker'),readiness:async()=>true,
      authorize:async()=>({actorProfileId:actor})});
    assert.deepEqual(await service.listReviews({accessToken:'x'}),{protocol:1,status:'ok',reviews:[]});
    const requestId=crypto.randomUUID();assert.deepEqual(await service.merge({accessToken:'x',requestId,sourceProfileId:source,targetProfileId:target}),{protocol:1,status:'merged'});
    assert.equal((await query('SELECT count(*)::int n FROM public.users WHERE id=$1',[source])).rows[0].n,0);
    assert.equal(Number((await query('SELECT current_haifn,school FROM public.users WHERE id=$1',[target])).rows[0].current_haifn),15);
    assert.equal((await query('SELECT user_id FROM public.logs')).rows[0].user_id,target);
    assert.deepEqual((await query('SELECT status FROM public.notice_responses')).rows,[{status:'TARGET'}]);
    assert.deepEqual((await query('SELECT participant_ids FROM public.school_logs')).rows[0].participant_ids,[target]);
    assert.equal((await query('SELECT count(*)::int n FROM public.calling_forest_progress')).rows[0].n,1);
    assert.deepEqual(await service.merge({accessToken:'x',requestId,sourceProfileId:source,targetProfileId:target}),{protocol:1,status:'merged'});
    const source2=crypto.randomUUID();await admin(()=>query(`INSERT INTO public.users(id,name,phone,phone_back4,user_group,preferences,current_haifn,role,status)
      VALUES($1,'보존임시','010-0000-0004','0004','게스트','{"is_temporary":true}',7,'user','approved')`,[source2]));
    await admin(()=>query('INSERT INTO public.unreviewed_reference VALUES($1,$2)',[crypto.randomUUID(),source2]));
    await assert.rejects(service.merge({accessToken:'x',requestId:crypto.randomUUID(),sourceProfileId:source2,targetProfileId:target}),e=>e.code==='account_changed');
    assert.equal(Number((await query('SELECT current_haifn FROM public.users WHERE id=$1',[target])).rows[0].current_haifn),15);
    assert.equal((await query('SELECT count(*)::int n FROM public.users WHERE id=$1',[source2])).rows[0].n,1);
    console.log('PASS account merge: live admin, temporary-only source, atomic points/activity/arrays, duplicate collapse, idempotent receipt and unknown-reference rollback');
}finally{await db.close();}
