import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fetchProgramInterestCounts} from '../src/api/programInterestCountsApi.js';

const db=new PGlite();
try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;
        CREATE SCHEMA auth;CREATE SCHEMA calendar_private;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
        CREATE TABLE calendar_private.admin_identities(auth_user_id uuid PRIMARY KEY);
        INSERT INTO calendar_private.admin_identities VALUES('00000000-0000-0000-0000-000000000001');
        CREATE FUNCTION public.calendar_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
            SET search_path=pg_catalog,calendar_private AS $$SELECT EXISTS(SELECT 1 FROM calendar_private.admin_identities WHERE auth_user_id=auth.uid())$$;
        CREATE TABLE notices(id bigint PRIMARY KEY,category text);
        CREATE TABLE program_recruitment_interests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notice_id bigint,
            auth_user_id text,enabled boolean,fcm_token text,UNIQUE(notice_id,auth_user_id));
        INSERT INTO notices VALUES(1,'PROGRAM'),(2,'PROGRAM'),(3,'NOTICE');
        INSERT INTO program_recruitment_interests(notice_id,auth_user_id,enabled,fcm_token) VALUES
            (1,'one',true,'secret-one'),(1,'two',true,'secret-two'),(1,'cancelled',false,'secret-three');
        ALTER TABLE program_recruitment_interests ENABLE ROW LEVEL SECURITY;
        GRANT SELECT ON program_recruitment_interests TO authenticated;
        CREATE POLICY owner_only ON program_recruitment_interests FOR SELECT TO authenticated USING(auth_user_id=auth.uid()::text);`);
    const before=(await db.query('SELECT * FROM program_recruitment_interests ORDER BY auth_user_id')).rows;
    await db.exec(readFileSync(new URL('../supabase/migrations/20260831010500_admin_program_interest_counts.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM program_recruitment_interests ORDER BY auth_user_id')).rows,before);
    await db.exec("SET ROLE anon");
    await assert.rejects(db.query('SELECT * FROM admin_program_interest_counts'));
    await db.exec("RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)");
    assert.equal((await db.query('SELECT * FROM admin_program_interest_counts')).rows.length,0);
    await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
    assert.equal((await db.query('SELECT * FROM program_recruitment_interests')).rows.length,0);
    const rows=(await db.query('SELECT * FROM admin_program_interest_counts ORDER BY notice_id')).rows;
    assert.deepEqual(rows.map(r=>[Number(r.notice_id),Number(r.interest_count)]),[[1,2],[2,0]]);
    assert.deepEqual(Object.keys(rows[0]).sort(),['interest_count','notice_id']);
    await assert.rejects(db.query('SELECT fcm_token FROM admin_program_interest_counts'));
    await assert.rejects(db.exec('UPDATE admin_program_interest_counts SET interest_count=9'));
    await db.exec("RESET ROLE; UPDATE program_recruitment_interests SET enabled=false WHERE auth_user_id='two'; SET ROLE authenticated;");
    assert.equal(Number((await db.query('SELECT interest_count FROM admin_program_interest_counts WHERE notice_id=1')).rows[0].interest_count),1);
} finally {await db.close();}

const clientFor=fn=>({from:table=>{
    assert.equal(table,'admin_program_interest_counts');
    return {select:columns=>{assert.equal(columns,'notice_id,interest_count');return {in:(_key,ids)=>fn(ids)};}};
}});
let requests=0;
const client=clientFor(async ids=>{requests++;assert.ok(ids.length<=100);return {data:ids.map(id=>({notice_id:id,interest_count:id==='2'?0:4}))};});
const counts=await fetchProgramInterestCounts(client,Array.from({length:1205},(_,i)=>i+1));
assert.equal(requests,13);assert.equal(Object.keys(counts).length,1205);assert.equal(counts[2],0);
assert.deepEqual(await fetchProgramInterestCounts(client,[]),{});
await assert.rejects(fetchProgramInterestCounts(clientFor(async()=>({data:[]})),[1]));
await assert.rejects(fetchProgramInterestCounts(clientFor(async()=>({error:{code:'42P01'}})),[1]));
await assert.rejects(fetchProgramInterestCounts(clientFor(async()=>({data:[{notice_id:1,interest_count:-1}]})),[1]));
console.log('PASS: admin-only totals, ordinary/anonymous denial, true zero, cancellation, no identities/tokens, raw data preservation, 1205-program batching and no false zero on unavailable counts.');
