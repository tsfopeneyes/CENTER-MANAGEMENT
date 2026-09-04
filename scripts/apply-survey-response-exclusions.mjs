import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const command = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
const dryRun = execFileSync(command, ['/d', '/s', '/c', 'npx supabase db dump --linked --schema public --dry-run'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 2_000_000
});
const value = name => dryRun.match(new RegExp(`export ${name}="([^"]+)"`))?.[1];
const required = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
if (required.some(name => !value(name))) throw new Error('Live database connection was not issued');

const ca = await readFile('C:/Users/Jin/Downloads/prod-ca-2021.crt', 'utf8');
const sql = await readFile(new URL('../supabase/migrations/20260903010000_add_survey_response_aggregation_exclusions.sql', import.meta.url), 'utf8');
const pool = new pg.Pool({
    host: value('PGHOST'),
    port: Number(value('PGPORT')),
    user: value('PGUSER'),
    password: value('PGPASSWORD'),
    database: value('PGDATABASE'),
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
    application_name: 'survey-response-exclusions-migration'
});

try {
    const client = await pool.connect();
    try {
        await client.query('SET ROLE postgres');
        const before = await client.query('SELECT count(*)::int AS count FROM public.checkin_surveys');
        await client.query(sql);
        const after = await client.query(`SELECT count(*)::int AS count,
          count(*) FILTER (WHERE aggregation_excluded)::int AS excluded
          FROM public.checkin_surveys`);
        if (before.rows[0].count !== after.rows[0].count) throw new Error('Survey response count changed unexpectedly');
        console.log(JSON.stringify({ status: 'complete', responses: after.rows[0].count, excluded: after.rows[0].excluded }));
    } finally {
        client.release();
    }
} finally {
    await pool.end();
}
