import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
        CREATE TABLE public.users(id uuid PRIMARY KEY,auth_user_id uuid UNIQUE,name text NOT NULL,
            phone text NOT NULL,phone_back4 text NOT NULL,gender text,school text,church text,birth text,
            user_group text,role text,status text,password text,guardian_name text,guardian_phone text,
            guardian_relation text,preferences jsonb,bio text,profile_image_url text,is_master boolean,memo text,current_haifn numeric);
        ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
        CREATE POLICY legacy_broad ON public.users FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,is_anonymous boolean,banned_until timestamptz);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);`);
    for(const name of ['session','login','migration','credential','registration','membership','roles','bootstrap','profile','member-admin','account-merge']){
        await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-'+name+'-foundation.sql',import.meta.url),'utf8'));
    }
    assert.equal((await db.query('SELECT count(*)::int AS count FROM public.users')).rows[0].count,0);
    for(const role of ['anon','authenticated']){
        await db.exec('SET ROLE '+role);
        for(const table of ['accounts','session_assurances','login_identifiers','legacy_credentials','credential_confirmations','credential_operations','registration_operations','membership_receipts','guest_link_reviews','account_roles','account_merge_receipts']){
            await assert.rejects(db.query('SELECT * FROM account_security.'+table),/permission denied/);
        }
        await db.exec('RESET ROLE');
    }
    const roles=await db.query("SELECT rolname,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname LIKE 'account_%'");
    for(const role of roles.rows){assert.equal(role.rolcanlogin,false);assert.equal(role.rolbypassrls,false);}
    const actor='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002';
    const actorAuth='20000000-0000-4000-8000-000000000001',targetAuth='20000000-0000-4000-8000-000000000002';
    await db.query("INSERT INTO auth.users(id,is_anonymous) VALUES($1,false),($2,false)",[actorAuth,targetAuth]);
    await db.query("INSERT INTO public.users(id,auth_user_id,name,phone,phone_back4,user_group,role) VALUES($1,$2,'admin','010-0000-0001','0001','STAFF','admin'),($3,$4,'member','010-0000-0002','0002','STAFF','user')",[actor,actorAuth,target,targetAuth]);
    await db.query("INSERT INTO account_security.accounts(profile_id,auth_user_id,mapping_verified,status,must_change_password) VALUES($1,$2,true,'active',false),($3,$4,true,'active',false)",[actor,actorAuth,target,targetAuth]);
    await db.query("INSERT INTO account_security.account_roles(profile_id,role,enabled) VALUES($1,'admin',true),($2,'member',true)",[actor,target]);
    await db.exec('SET ROLE account_confirmation_writer');
    await db.exec('BEGIN');await db.query("SELECT set_config('app.actor_profile_id',$1,true)",[actor]);
    await db.query("INSERT INTO account_security.credential_confirmations(id,profile_id,actor_profile_id,purpose,valid_until) VALUES($1,$2,$3,'password_reset',clock_timestamp()+interval '5 minutes')",[crypto.randomUUID(),target,actor]);
    await db.exec('COMMIT');
    await db.exec('BEGIN');await db.query("SELECT set_config('app.actor_profile_id',$1,true)",[target]);
    await assert.rejects(db.query("INSERT INTO account_security.credential_confirmations(id,profile_id,actor_profile_id,purpose,valid_until) VALUES($1,$2,$3,'password_reset',clock_timestamp()+interval '5 minutes')",[crypto.randomUUID(),target,actor]),/row-level security/);
    await db.exec('ROLLBACK');await db.exec('RESET ROLE');
    await db.exec('SET ROLE account_profile_worker');
    await assert.rejects(db.query("UPDATE public.users SET password='injected'"),/permission denied/);
    await assert.rejects(db.query("UPDATE account_security.account_roles SET role='admin'"),/permission denied/);
    await db.exec('RESET ROLE');await db.exec('SET ROLE account_member_admin_worker');await db.exec('BEGIN');
    await db.query("SELECT set_config('app.target_profile_id',$1,true)",[target]);
    assert.equal((await db.query("UPDATE public.users SET role='admin' WHERE id=$1 AND user_group='STAFF' RETURNING id",[target])).rows.length,1);
    assert.equal((await db.query("UPDATE account_security.account_roles SET role='admin',enabled=true WHERE profile_id=$1 RETURNING profile_id",[target])).rows.length,1);
    assert.equal((await db.query("SELECT profile_id FROM account_security.accounts WHERE profile_id=$1",[target])).rows.length,1);
    await assert.rejects(db.query("DELETE FROM account_security.session_assurances WHERE profile_id=$1",[target]),/permission denied/);
    await db.exec('COMMIT');
    assert.equal((await db.query('SELECT credential_version FROM account_security.accounts WHERE profile_id=$1',[target])).rows[0].credential_version,1);
    assert.equal((await db.query("UPDATE public.users SET role='admin' WHERE id=$1 RETURNING id",[actor])).rows.length,0);
    await db.exec('RESET ROLE');
    console.log('PASS combined 11 auth foundation proposals: schema compatibility, no seeding, client-private denial, server NOLOGIN/NOBYPASSRLS, profile worker cannot write passwords/roles');
}finally{await db.close();}
