import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {createRoleBoundPool} from '../supabase/functions/_shared/roleBoundPool.mjs';
import {createLoginKey} from '../supabase/functions/_shared/loginSecurity.mjs';
import {createAccountBootstrapStore} from '../supabase/functions/_shared/accountBootstrapStore.mjs';
import {createAccountBootstrapService} from '../supabase/functions/_shared/accountBootstrapService.mjs';

const apply=process.argv.includes('--apply');
const project='erecqalsxoxrufggvmcc';
const command=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe';
const dry=execFileSync(command,['/d','/s','/c','npx supabase db dump --linked --schema public --dry-run'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:2_000_000});
const value=name=>dry.match(new RegExp(`export ${name}="([^"]+)"`))?.[1];
const required=['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'];
if(required.some(name=>!value(name)))throw Error('Live database connection was not issued');
const ca=await readFile('C:/Users/Jin/Downloads/prod-ca-2021.crt','utf8');
const base=new pg.Pool({host:value('PGHOST'),port:Number(value('PGPORT')),user:value('PGUSER'),
    password:value('PGPASSWORD'),database:value('PGDATABASE'),ssl:{ca,rejectUnauthorized:true},max:2,
    connectionTimeoutMillis:10000,application_name:'account-auth-bootstrap'});
const privileged={
    async connect(){const client=await base.connect();try{await client.query('SET ROLE postgres');return client;}
        catch(error){client.release(true);throw error;}},
    async query(text,values){const client=await this.connect();try{return await client.query(text,values);}finally{client.release();}}
};
try{
    const inventory=(await privileged.query(`SELECT
      (SELECT count(*)::int FROM public.users) profiles,
      (SELECT count(*)::int FROM auth.users) auth_accounts,
      (SELECT count(*)::int FROM public.users u WHERE u.password IS NOT NULL AND EXISTS
        (SELECT 1 FROM auth.users a WHERE a.id=COALESCE(u.auth_user_id,u.id))) eligible,
      (SELECT count(*)::int FROM account_security.accounts) bootstrapped,
      has_schema_privilege('account_bootstrap_worker','auth','USAGE') auth_schema_usage,
      has_table_privilege('anon','storage.objects','INSERT') anon_storage_insert,
      has_table_privilege('authenticated','storage.objects','INSERT') authenticated_storage_insert,
      COALESCE(has_function_privilege('anon',to_regprocedure('public.legacy_login_sync(text,text)'),'EXECUTE'),false) legacy_rpc_anon_execute,
      (SELECT COALESCE(json_agg(DISTINCT r.rolname ORDER BY r.rolname),'[]'::json) FROM pg_class c
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x
        JOIN pg_roles r ON r.oid=x.grantee WHERE c.oid='storage.objects'::regclass AND x.privilege_type='INSERT') storage_insert_grantees,
      (SELECT count(*)::int FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
        AND cmd IN ('INSERT','UPDATE','DELETE','ALL')) storage_write_policies`)).rows[0];
    if(!apply){console.log(JSON.stringify({mode:'read-only',...inventory}));process.exit(0);}
    if(inventory.profiles<1||inventory.auth_accounts<1)throw Error('Unexpected live inventory');
    const lookupSecret=randomBytes(48).toString('base64url');
    const bridgeSecret=randomBytes(48).toString('base64url');
    const pepper=randomBytes(48).toString('base64url');
    const worker=createRoleBoundPool(privileged,'account_bootstrap_worker');
    const writes=createAccountBootstrapStore(worker);
    const store={...writes,async readBatch(after=null,limit=50){return (await privileged.query(`SELECT
        u.id::text AS "profileId",COALESCE(u.auth_user_id,u.id)::text AS "authUserId",u.name,u.phone,
        u.password AS "publicCredential",u.user_group AS "userGroup",u.role,u.status,u.preferences,u.is_master AS "isMaster",
        au.email,au.is_anonymous AS "isAnonymous",au.banned_until AS "bannedUntil"
        FROM public.users u JOIN auth.users au ON au.id=COALESCE(u.auth_user_id,u.id)
        WHERE ($1::uuid IS NULL OR u.id>$1::uuid) ORDER BY u.id LIMIT $2`,[after,limit])).rows;}};
    const bootstrap=createAccountBootstrapService({store,
        keyFor:await createLoginKey(lookupSecret),readiness:async()=>true});
    const result=await bootstrap();
    const live=(await privileged.query(`SELECT s.id::text AS "sessionId",a.auth_user_id::text AS "authUserId",
        a.profile_id::text AS "profileId",a.credential_version AS "credentialVersion"
        FROM account_security.accounts a JOIN auth.sessions s ON s.user_id=a.auth_user_id
        JOIN auth.users u ON u.id=a.auth_user_id WHERE a.mapping_verified AND a.status='active'
        AND NOT a.must_change_password AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
        AND u.is_anonymous=false AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())`)).rows;
    let seeded=0;
    for(const row of live){const saved=await worker.query(`INSERT INTO account_security.session_assurances
        (session_id,auth_user_id,profile_id,credential_version,status,valid_until)
        VALUES($1,$2,$3,$4,'trusted',clock_timestamp()+interval '24 hours')
        ON CONFLICT(session_id) DO NOTHING RETURNING session_id`,
        [row.sessionId,row.authUserId,row.profileId,row.credentialVersion]);seeded+=saved.rows.length;}
    const sessions={status:'complete',seeded};
    const after=(await privileged.query(`SELECT
      (SELECT count(*)::int FROM account_security.accounts) accounts,
      (SELECT count(*)::int FROM account_security.login_identifiers) identifiers,
      (SELECT count(*)::int FROM account_security.legacy_credentials) credentials,
      (SELECT count(*)::int FROM account_security.account_roles) roles,
      (SELECT count(*)::int FROM account_security.session_assurances) assurances`)).rows[0];
    if(after.accounts!==after.identifiers||after.accounts!==after.credentials||after.accounts!==after.roles||
        after.accounts!==inventory.eligible)throw Error('Bootstrap count mismatch');
    const secrets=[
      `ACCOUNT_LOOKUP_SECRET=${lookupSecret}`,`ACCOUNT_LEGACY_BRIDGE_SECRET=${bridgeSecret}`,
      `ACCOUNT_TEMPORARY_PEPPER=${pepper}`,'ACCOUNT_ALLOWED_ORIGINS=https://app.schoolchurchimpact.org,https://sci-center-6f265.web.app,https://sci-center-6f265.firebaseapp.com',
      'ACCOUNT_TERMS_VERSION=current','ACCOUNT_LOGIN_DOMAIN=account.schoolchurchimpact.org','ACCOUNT_AUTH_READY=true'];
    const set=spawnSync(command,['/d','/s','/c',
        ['npx','supabase','secrets','set','--project-ref',project,...secrets].join(' ')],
        {stdio:['ignore','ignore','ignore'],timeout:120000});
    lookupSecret.fill?.(0);bridgeSecret.fill?.(0);pepper.fill?.(0);
    if(set.status!==0)throw Error('Server secret configuration failed');
    console.log(JSON.stringify({status:'complete',bootstrap:result,sessions,counts:after}));
}finally{await base.end();}
