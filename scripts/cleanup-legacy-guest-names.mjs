import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

const apply=process.argv.includes('--apply');
const command=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe';
const dry=execFileSync(command,['/d','/s','/c','npx supabase db dump --linked --schema public --dry-run'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:2_000_000});
const value=name=>dry.match(new RegExp(`export ${name}="([^"]+)"`))?.[1];
const required=['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'];
if(required.some(name=>!value(name)))throw new Error('Live database connection was not issued');

const ca=await readFile('C:/Users/Jin/Downloads/prod-ca-2021.crt','utf8');
const pool=new pg.Pool({host:value('PGHOST'),port:Number(value('PGPORT')),user:value('PGUSER'),
    password:value('PGPASSWORD'),database:value('PGDATABASE'),ssl:{ca,rejectUnauthorized:true},max:1,
    connectionTimeoutMillis:10000,application_name:'guest-name-cleanup'});

const client=await pool.connect();
try {
    await client.query('SET ROLE postgres');
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout='15s'");
    const audit=(await client.query(`WITH targets AS (
        SELECT id,name,trim(regexp_replace(name,'\\s*\\(guest\\)\\s*$','','i')) clean_name,school,birth,phone
        FROM public.users
        WHERE user_group IN ('게스트','미가입') AND name ~* '\\(guest\\)\\s*$'
    ) SELECT
        count(*)::int target_count,
        count(*) FILTER (WHERE clean_name='')::int blank_name_count,
        (SELECT count(*)::int FROM public.users WHERE user_group NOT IN ('게스트','미가입') AND name ~* '\\(guest\\)\\s*$') non_guest_suffix_count,
        (SELECT count(*)::int FROM (
            SELECT clean_name,coalesce(school,''),coalesce(birth,''),regexp_replace(coalesce(phone,''),'[^0-9]','','g')
            FROM targets GROUP BY 1,2,3,4 HAVING count(*)>1
        ) duplicates) exact_duplicate_groups
    FROM targets`)).rows[0];
    console.log(JSON.stringify({mode:apply?'apply':'read-only',...audit}));
    if(Number(audit.blank_name_count)!==0)throw new Error('Blank cleaned guest name detected');
    if(apply) {
        const result=await client.query(`UPDATE public.users
            SET name=trim(regexp_replace(name,'\\s*\\(guest\\)\\s*$','','i'))
            WHERE user_group IN ('게스트','미가입') AND name ~* '\\(guest\\)\\s*$'
            RETURNING id`);
        if(result.rowCount!==Number(audit.target_count))throw new Error('Cleanup count changed during transaction');
        await client.query('COMMIT');
        console.log(JSON.stringify({status:'complete',updated:result.rowCount}));
    } else {
        await client.query('ROLLBACK');
    }
} catch(error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
} finally {
    client.release();
    await pool.end();
}
