import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createCredentialStore} from '../supabase/functions/_shared/credentialStore.mjs';
import {createCredentialService} from '../supabase/functions/_shared/credentialService.mjs';
import {createLoginKey} from '../supabase/functions/_shared/loginSecurity.mjs';

const db=new PGlite();
const profileId=crypto.randomUUID(),authUserId=crypto.randomUUID(),actorId=crypto.randomUUID();
const query=(sql,args)=>db.query(sql,args);
let releases=0,connections=0;
const pool={query,connect:async()=>{connections++;return {query,release(){releases++;}};}};
const store=createCredentialStore(pool);
const keyFor=await createLoginKey('fixture-only-key-never-used-in-production-123456789');
const fixtureDigest='fixture-kdf-digest:'+('a'.repeat(64));
let nativePassword='original-password',writes=0,hashes=0,verifies=0;
let failWrite=false,failComplete=false,allowed=true,quota=true,policy=true,hook;
const passwordHasher={
  async hash(value,context){assert.equal(value,'1234');assert.equal(context.purpose,'temporary');assert.equal(context.profileId,profileId);hashes++;return fixtureDigest;},
  async verify(value,digest,context){assert.equal(digest,fixtureDigest);assert.equal(context.profileId,profileId);verifies++;if(hook)await hook();return value==='1234';}
};
const service=createCredentialService({
  store:{...store,async complete(op){if(failComplete)throw Error('injected commit loss');return store.complete(op);}},
  limits:{async consumeLimit(){return quota;}},keyFor,passwordHasher,
  adminAuth:{async updateUserById(id,attributes){assert.equal(id,authUserId);assert.deepEqual(Object.keys(attributes),['password']);writes++;nativePassword=attributes.password;if(failWrite)throw Error('injected response loss AFTER Auth accepted password');return {data:{user:{id:authUserId}},error:null};}},
  async verifyReset(input){return {allowed,actorId,account:{profileId,authUserId,credentialVersion:(await state()).credential_version},confirmationId:input.confirmationId,phoneLast4:'1234',validUntil:Date.now()+60000};},
  readiness:async()=>true,passwordPolicy:async()=>policy,temporaryTtlMs:600000
});
const state=async()=>(await query('SELECT * FROM account_security.accounts WHERE profile_id=$1',[profileId])).rows[0];
const ctx={clientKey:'trusted-fixture-ingress'};
const reset=async(confirmationId=crypto.randomUUID())=>{
  await db.exec('RESET ROLE');
  await query("INSERT INTO account_security.credential_confirmations(id,profile_id,actor_profile_id,purpose,valid_until) VALUES($1,$2,$3,'password_reset',clock_timestamp()+interval '1 hour') ON CONFLICT(id) DO NOTHING",[confirmationId,profileId,actorId]);
  await db.exec('SET ROLE account_credential_worker');
  return service.reset({protocol:1,profileId,confirmationId},ctx);
};
const change=(temporaryPassword='1234',newPassword='new native password 2026')=>service.changeTemporary({protocol:1,profileId,temporaryPassword,newPassword},ctx);
const reject=async(action,code)=>assert.rejects(action,e=>e.code===code);

try {
  await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE public.users(id uuid PRIMARY KEY,name text,phone text,phone_back4 text,school text,user_group text);CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,banned_until timestamptz);CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);");
  for(const file of ['auth-session-foundation','auth-login-foundation','auth-credential-foundation']) await db.exec(readFileSync(new URL('../supabase/manual/proposals/'+file+'.sql',import.meta.url),'utf8'));
  await query('INSERT INTO public.users VALUES($1,$2,$3,$4)',[profileId,'original profile','010-0000-1234','1234']);
  await query('INSERT INTO public.users VALUES($1,$2,$3,$4)',[actorId,'fixture administrator','010-0000-9999','9999']);
  await query('INSERT INTO auth.users VALUES($1,false,NULL)',[authUserId]);
  const actorAuthUserId=crypto.randomUUID();await query('INSERT INTO auth.users VALUES($1,false,NULL)',[actorAuthUserId]);
  await query("INSERT INTO account_security.accounts VALUES($1,$2,true,'active',1,false)",[profileId,authUserId]);
  await query("INSERT INTO account_security.accounts VALUES($1,$2,true,'active',1,false)",[actorId,actorAuthUserId]);
  await query("INSERT INTO account_security.login_identifiers(profile_id,login_email,name_key,credential_mode,enabled) VALUES($1,'fixture@example.invalid',$2,'supabase_password',true)",[profileId,'a'.repeat(64)]);
  await db.exec('SET ROLE account_credential_worker');
  await assert.rejects(query('DELETE FROM account_security.credential_operations'),/permission denied/);
  await assert.rejects(query("UPDATE public.users SET name='bad'"),/permission denied/);
  allowed=false;await reject(reset,'forbidden');allowed=true;
  quota=false;await reject(reset,'try_later');quota=true;
  assert.equal((await state()).status,'active');assert.equal(writes,0);

  const confirmation=crypto.randomUUID();
  assert.deepEqual(await reset(confirmation),{protocol:1,status:'password_change_required'});
  assert.equal(nativePassword,'original-password');assert.equal(writes,0);
  assert.equal((await state()).must_change_password,true);
  const epoch=(await state()).credential_version;
  const temp=(await query('SELECT * FROM account_security.temporary_credentials')).rows[0];
  assert.equal(temp.password_digest,fixtureDigest);assert.ok(!JSON.stringify(temp).includes('1234'));
  await assert.rejects(reset(confirmation));assert.equal(writes,0);assert.equal(hashes,2);assert.equal((await state()).credential_version,epoch);
  await reject(()=>change('9999'),'invalid_login');assert.equal(writes,0);
  await query("UPDATE account_security.temporary_credentials SET valid_until=clock_timestamp()-interval '1 second'");
  await reject(change,'invalid_login');assert.equal(writes,0);
  await query("UPDATE account_security.temporary_credentials SET valid_until=clock_timestamp()+interval '10 minutes'");
  await reject(()=>change('1234','12345'),'invalid_request');
  policy=false;await reject(change,'password_policy');policy=true;
  assert.deepEqual(await change(),{protocol:1,status:'login_required'});
  assert.equal(nativePassword,'new native password 2026');assert.equal(writes,1);
  assert.equal((await state()).must_change_password,false);assert.equal((await state()).status,'active');assert.equal((await state()).credential_version,epoch+1);
  await reject(change,'invalid_login');
  const selfAccount=await store.readActive(profileId);assert.equal(selfAccount.credentialVersion,epoch+1);
  const selfOperation=await store.reserve({id:crypto.randomUUID(),account:selfAccount,kind:'self_change',actorId:profileId});
  await store.complete(selfOperation);assert.equal((await state()).credential_version,epoch+2);assert.equal((await state()).must_change_password,false);
  await db.exec('RESET ROLE');
  await query("UPDATE account_security.login_identifiers SET credential_mode='legacy_bridge' WHERE profile_id=$1",[profileId]);
  await query("INSERT INTO account_security.legacy_credentials(profile_id,password_digest) VALUES($1,$2)",[profileId,'b'.repeat(64)]);
  await db.exec('SET ROLE account_credential_worker');
  const legacyAccount=await store.readActive(profileId);assert.equal(legacyAccount.credentialMode,'legacy_bridge');
  const legacyChange=await store.reserve({id:crypto.randomUUID(),account:legacyAccount,kind:'self_change',actorId:profileId});
  await store.complete(legacyChange);
  assert.equal((await query('SELECT credential_mode FROM account_security.login_identifiers WHERE profile_id=$1',[profileId])).rows[0].credential_mode,'supabase_password');
  assert.equal((await query('SELECT count(*)::int AS n FROM account_security.legacy_credentials WHERE profile_id=$1',[profileId])).rows[0].n,0);

  await reset();
  hook=()=>query('UPDATE account_security.accounts SET credential_version=credential_version+1 WHERE profile_id=$1',[profileId]);
  const beforeWrites=writes;await reject(change,'account_changed');hook=null;assert.equal(writes,beforeWrites);

  await query("UPDATE account_security.accounts SET status='active'");
  await reset();failWrite=true;await reject(change,'temporarily_unavailable');failWrite=false;
  assert.equal((await state()).status,'blocked');
  const blockedWrites=writes;await reject(reset,'account_changed');assert.equal(writes,blockedWrites);
  assert.equal((await query("SELECT count(*)::int AS n FROM account_security.credential_operations WHERE state='pending'")).rows[0].n,1);

  await query("UPDATE account_security.credential_operations SET state='completed' WHERE state='pending'");
  await query("UPDATE account_security.accounts SET status='active'");
  failComplete=true;await reject(reset,'temporarily_unavailable');failComplete=false;
  assert.equal((await state()).status,'blocked');assert.equal(connections,releases);
  await db.exec('RESET ROLE');
  assert.deepEqual((await query('SELECT name FROM public.users WHERE id=$1',[profileId])).rows,[{name:'original profile'}]);
  const journal=JSON.stringify((await query('SELECT * FROM account_security.credential_operations')).rows);
  assert.ok(!journal.includes('new native password')&&!journal.includes('1234')&&!journal.includes('fixture@example'));
  assert.ok(verifies>=4);
  for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(query('SELECT * FROM account_security.temporary_credentials'),/permission denied/);await assert.rejects(query('SELECT * FROM account_security.credential_operations'),/permission denied/);await db.exec('RESET ROLE');}
  assert.throws(()=>createCredentialService({store,limits:{},keyFor}),/password hasher/i);
  console.log('PASS credential lifecycle: private one-use digest, expiry, permanent native change, epoch race, failure blocking, permissions, unchanged profiles');
} finally {await db.close();}
