import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

const command=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe';
const dry=execFileSync(command,['/d','/s','/c','npx supabase db dump --linked --schema public --dry-run'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:2_000_000});
const value=name=>dry.match(new RegExp(`export ${name}="([^"]+)"`))?.[1];
const required=['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'];
if(required.some(name=>!value(name)))throw Error('Live database connection was not issued');
const ca=await readFile('C:/Users/Jin/Downloads/prod-ca-2021.crt','utf8');
const pool=new pg.Pool({host:value('PGHOST'),port:Number(value('PGPORT')),user:value('PGUSER'),
    password:value('PGPASSWORD'),database:value('PGDATABASE'),ssl:{ca,rejectUnauthorized:true},max:1,
    connectionTimeoutMillis:10000,application_name:'account-auth-mode-audit'});
try{
    const client=await pool.connect();
    try{
        await client.query('BEGIN READ ONLY');
        await client.query('SET LOCAL ROLE postgres');
        const result=(await client.query(`SELECT
          count(*) FILTER (WHERE credential_mode='legacy_pending')::int AS pending,
          count(*) FILTER (WHERE credential_mode='legacy_bridge')::int AS bridge,
          count(*) FILTER (WHERE credential_mode='supabase_password')::int AS standard,
          count(*) FILTER (WHERE credential_mode NOT IN ('legacy_pending','legacy_bridge','supabase_password'))::int AS unexpected,
          (SELECT count(*)::int FROM public.users WHERE password IS NOT NULL) AS all_public_passwords,
          (SELECT count(*)::int FROM public.users u JOIN account_security.accounts a ON a.profile_id=u.id
            WHERE u.password IS NOT NULL) AS migrated_public_passwords
          FROM account_security.login_identifiers`)).rows[0];
        const nameCheck=(await client.query(`SELECT
          count(*) FILTER (WHERE name='jin')::int AS exact_lower,
          count(*) FILTER (WHERE lower(name)=lower('jin'))::int AS case_insensitive
          FROM public.users`)).rows[0];
        await client.query('ROLLBACK');
        console.log(JSON.stringify({mode:'read-only',...result,name_check:nameCheck}));
    }finally{client.release();}
}finally{await pool.end();}
