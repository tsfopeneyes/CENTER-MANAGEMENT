import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createRoleBoundPool} from '../supabase/functions/_shared/roleBoundPool.mjs';
import {createLegacyMigrationStore} from '../supabase/functions/_shared/legacyMigrationStore.mjs';
import {createLegacyMigrationService} from '../supabase/functions/_shared/legacyMigrationService.mjs';
import {createLegacyCredentialBridge} from '../supabase/functions/_shared/legacyCredentialBridge.mjs';

const db=new PGlite(),profileId=crypto.randomUUID(),authUserId=crypto.randomUUID();let fail=true,providerPassword;
try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
      CREATE TABLE public.users(id uuid PRIMARY KEY,name text,school text,user_group text,password text);
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;CREATE POLICY broad ON public.users FOR ALL TO public USING(true) WITH CHECK(true);
      CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,banned_until timestamptz);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);`);
    for(const name of ['session','login','migration'])await db.exec(readFileSync(new URL('../supabase/manual/proposals/auth-'+name+'-foundation.sql',import.meta.url),'utf8'));
    await db.query("INSERT INTO public.users VALUES($1,'기존회원','학교','청소년','1234')",[profileId]);
    await db.query('INSERT INTO auth.users VALUES($1,false,NULL)',[authUserId]);
    await db.query("INSERT INTO account_security.accounts(profile_id,auth_user_id,mapping_verified,status,must_change_password) VALUES($1,$2,true,'active',false)",[profileId,authUserId]);
    await db.query("INSERT INTO account_security.login_identifiers(profile_id,login_email,name_key,credential_mode,enabled) VALUES($1,'legacy@example.invalid',$2,'legacy_pending',true)",[profileId,'a'.repeat(64)]);
    const basePool={async connect(){return {query:(sql,args)=>db.query(sql,args),release(){}};}};
    const store=createLegacyMigrationStore(createRoleBoundPool(basePool,'account_migration_worker'));
    const bridge=await createLegacyCredentialBridge('fixture-migration-bridge-secret-12345678901234567890');
    const service=createLegacyMigrationService({store,bridge,readiness:async()=>true,adminAuth:{updateUserById:async(id,{password})=>{
        assert.equal(id,authUserId);providerPassword=password;if(fail)return {error:{code:'lost_response'}};return {data:{user:{id}}};}}});
    await assert.rejects(()=>service(profileId),e=>e.code==='temporarily_unavailable');
    let state=(await db.query(`SELECT i.credential_mode,u.password,l.password_digest FROM account_security.login_identifiers i
      JOIN public.users u ON u.id=i.profile_id JOIN account_security.legacy_credentials l USING(profile_id) WHERE i.profile_id=$1`,[profileId])).rows[0];
    assert.equal(state.credential_mode,'legacy_pending');assert.equal(state.password,'1234');assert.match(state.password_digest,/^[a-f0-9]{64}$/);
    assert.equal(providerPassword,await bridge.providerPassword(profileId,state.password_digest));
    fail=false;assert.deepEqual(await service(profileId),{status:'migrated',profileId});
    state=(await db.query(`SELECT i.credential_mode,u.password,l.password_digest FROM account_security.login_identifiers i
      JOIN public.users u ON u.id=i.profile_id JOIN account_security.legacy_credentials l USING(profile_id) WHERE i.profile_id=$1`,[profileId])).rows[0];
    assert.equal(state.credential_mode,'legacy_bridge');assert.equal(state.password,null);assert.match(state.password_digest,/^[a-f0-9]{64}$/);
    assert.deepEqual(await service(profileId),{status:'migrated',profileId},'completed migration is idempotent');
    assert.deepEqual(await service.rollback(profileId),{status:'rolled_back',profileId});
    state=(await db.query(`SELECT i.credential_mode,u.password,l.password_digest FROM account_security.login_identifiers i
      JOIN public.users u ON u.id=i.profile_id JOIN account_security.legacy_credentials l USING(profile_id) WHERE i.profile_id=$1`,[profileId])).rows[0];
    assert.equal(state.credential_mode,'legacy_pending');assert.equal(state.password,state.password_digest);assert.equal(providerPassword,state.password_digest);
    console.log('PASS legacy migration: plaintext/hash normalization, resumable provider uncertainty, private digest, public removal, idempotence and legacy rollback');
}finally{await db.close();}
