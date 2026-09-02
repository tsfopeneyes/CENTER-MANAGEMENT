import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
        CREATE TABLE public.users(id integer PRIMARY KEY,name text);
        INSERT INTO public.users VALUES(1,'unchanged');
        CREATE TABLE public.raw_logs(id integer PRIMARY KEY,content text);
        INSERT INTO public.raw_logs VALUES(1,'unchanged log');
        GRANT ALL ON public.users TO anon,authenticated;`);
    const before=(await db.query('SELECT * FROM public.users')).rows;
    const logs=(await db.query('SELECT * FROM public.raw_logs')).rows;
    const sql=readFileSync(new URL('../supabase/manual/restrict-client-users-ddl-privileges.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql); // safe repeat
    for(const role of ['anon','authenticated']) {
        for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
            const row=(await db.query("SELECT has_table_privilege($1,'public.users',$2) AS allowed",[role,privilege])).rows[0];
            assert.equal(row.allowed,['SELECT','INSERT','UPDATE','DELETE'].includes(privilege));
        }
        await db.exec('SET ROLE '+role);
        await assert.rejects(db.exec('TRUNCATE public.users'),/permission denied/);
        assert.deepEqual((await db.query('SELECT * FROM public.users')).rows,before);
        await db.exec('RESET ROLE');
    }
    assert.deepEqual((await db.query('SELECT * FROM public.raw_logs')).rows,logs);
    console.log('PASS narrow client privilege hardening: CRUD unchanged, TRUNCATE/REFERENCES/TRIGGER denied, users/logs preserved');
}finally{await db.close();}
