import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const command = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
const dryRun = execFileSync(command, ['/d', '/s', '/c', 'npx supabase db dump --linked --schema public --dry-run'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 2_000_000
});
const value = name => dryRun.match(new RegExp(`export ${name}="([^"]+)"`))?.[1];
const required = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
if (required.some(name => !value(name))) throw new Error('Live database connection was not issued');

const ca = await readFile('C:/Users/Jin/Downloads/prod-ca-2021.crt', 'utf8');
const migrationName = process.argv[2] || '20260904120000_challenge_community.sql';
if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(migrationName)) throw new Error('Invalid migration file name');
const sql = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
const pool = new pg.Pool({ host: value('PGHOST'), port: Number(value('PGPORT')), user: value('PGUSER'), password: value('PGPASSWORD'), database: value('PGDATABASE'), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 10_000, application_name: 'challenge-community-migration' });

try {
    const client = await pool.connect();
    try {
        await client.query('SET ROLE postgres');
        const before = await client.query('SELECT (SELECT count(*) FROM public.notices)::int notices, (SELECT count(*) FROM public.notice_responses)::int responses, (SELECT count(*) FROM public.users)::int users');
        await client.query('BEGIN');
        try {
            await client.query(sql);
            const after = await client.query('SELECT (SELECT count(*) FROM public.notices)::int notices, (SELECT count(*) FROM public.notice_responses)::int responses, (SELECT count(*) FROM public.users)::int users');
            if (JSON.stringify(before.rows[0]) !== JSON.stringify(after.rows[0])) throw new Error('Protected row counts changed');
            await client.query('COMMIT');
            console.log(JSON.stringify({ status: 'complete', preserved: after.rows[0] }));
        } catch (error) { await client.query('ROLLBACK'); throw error; }
    } finally { client.release(); }
} finally { await pool.end(); }
