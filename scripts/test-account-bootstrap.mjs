import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createRoleBoundPool} from '../supabase/functions/_shared/roleBoundPool.mjs';
import {createAccountBootstrapStore} from '../supabase/functions/_shared/accountBootstrapStore.mjs';
import {createAccountBootstrapService} from '../supabase/functions/_shared/accountBootstrapService.mjs';
import {createExistingSessionBootstrap} from '../supabase/functions/_shared/existingSessionBootstrap.mjs';
import {createLoginKey} from '../supabase/functions/_shared/loginSecurity.mjs';

const db=new PGlite(),member=crypto.randomUUID(),guest=crypto.randomUUID(),adminAuth=crypto.randomUUID(),guestAuth=crypto.randomUUID(),session=crypto.randomUUID();
try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
    CREATE TABLE public.users(id uuid PRIMARY KEY,auth_user_id uuid,name text,school text,phone text,phone_back4 text,password text,user_group text,role text,status text,preferences jsonb,is_master boolean);
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;CREATE POLICY broad ON public.users FOR ALL TO public USING(true) WITH CHECK(true);
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,is_anonymous boolean,banned_until timestamptz);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);`);
  for(const name of ['session','login','credential','roles','bootstrap'])await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-'+name+'-foundation.sql',import.meta.url),'utf8'));
  await db.query(`INSERT INTO public.users VALUES($1,$2,'관리자','학교','010-1234-5678','5678','1234','관리자','admin','approved','{}',true),
    ($3,$4,'임시방문','학교','010-9999-9999','9999',NULL,'게스트','user','approved','{"is_temporary":true}',false)`,[member,adminAuth,guest,guestAuth]);
  await db.query("INSERT INTO auth.users VALUES($1,'admin@example.invalid',false,NULL),($2,'guest@example.invalid',false,NULL)",[adminAuth,guestAuth]);
  await db.query('INSERT INTO auth.sessions VALUES($1,$2,NULL)',[session,adminAuth]);
  const basePool={async connect(){return {query:(sql,args)=>db.query(sql,args),release(){}};}},store=createAccountBootstrapStore(createRoleBoundPool(basePool,'account_bootstrap_worker'));
  const keyFor=await createLoginKey('fixture-bootstrap-lookup-secret-12345678901234567890');
  const bootstrap=createAccountBootstrapService({store,keyFor,readiness:async()=>true,now:()=>Date.UTC(2026,8,1)});
  assert.deepEqual(await bootstrap(),{status:'complete',bootstrapped:1,skipped:1});assert.deepEqual(await bootstrap(),{status:'complete',bootstrapped:1,skipped:1});
  const saved=(await db.query(`SELECT a.mapping_verified,a.status,i.credential_mode,i.phone_key,l.password_digest,r.role,
    (SELECT count(*)::int FROM account_security.session_assurances s WHERE s.profile_id=a.profile_id) AS sessions
    FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
    JOIN account_security.legacy_credentials l USING(profile_id) JOIN account_security.account_roles r USING(profile_id)`)).rows[0];
  assert.equal(saved.mapping_verified,true);assert.equal(saved.status,'active');assert.equal(saved.credential_mode,'legacy_pending');
  assert.equal(saved.phone_key,await keyFor('phone','01012345678'));assert.match(saved.password_digest,/^[a-f0-9]{64}$/);assert.equal(saved.role,'admin');assert.equal(saved.sessions,0);
  await db.query("UPDATE account_security.login_identifiers SET credential_mode='legacy_bridge' WHERE profile_id=$1",[member]);
  const seed=createExistingSessionBootstrap({pool:createRoleBoundPool(basePool,'account_bootstrap_worker'),readiness:async()=>true,now:()=>Date.UTC(2026,8,1),graceMs:3600000});
  assert.deepEqual(await seed(),{status:'complete',seeded:1});assert.deepEqual(await seed(),{status:'complete',seeded:0});
  const assurance=(await db.query('SELECT credential_version FROM account_security.session_assurances WHERE session_id=$1',[session])).rows[0];
  assert.equal(assurance.credential_version,2,'assurance is seeded only after the migration epoch change');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM account_security.accounts WHERE profile_id=$1',[guest])).rows[0].n,0);
  console.log('PASS account bootstrap: verified links, current admin role, private lookup/digest, post-migration live-session grace, blank-credential exclusion and idempotence');
}finally{await db.close();}
