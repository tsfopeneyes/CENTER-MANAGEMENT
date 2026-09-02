import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const admin = '00000000-0000-0000-0000-000000000001';
const student = '00000000-0000-0000-0000-000000000002';
const linked = '00000000-0000-0000-0000-000000000003';
try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${admin}'),('${student}'),('${linked}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
      CREATE TABLE public.users(id uuid PRIMARY KEY,name text,role text,user_group text,auth_user_id uuid);
      INSERT INTO public.users VALUES ('${admin}','관리자','admin','관리자','${linked}'),('${student}','학생','user','학생',null);
      CREATE TABLE public.notices(id bigint PRIMARY KEY,title text,content text,images text[],image_url text,short_description text,max_capacity int DEFAULT 30,
        program_location text,category text,is_recruiting boolean,created_at timestamptz DEFAULT now(),is_sticky boolean,
        program_date timestamptz,program_start_date date,program_end_date date,program_days int[],target_regions text[],
        is_private boolean,is_challenge boolean,program_status text,recruitment_deadline timestamptz,guest_properties jsonb);
      CREATE TABLE public.notice_responses(notice_id bigint REFERENCES public.notices,user_id uuid,status text);
      ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
      CREATE POLICY old_allow_all ON public.notices FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
      GRANT ALL ON public.notices, public.users TO anon,authenticated,service_role;
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260831010000_calendar_recruitment_and_duty.sql',import.meta.url),'utf8'));
    await db.exec(`INSERT INTO notices(id,title,content,images,short_description,program_location,category,is_recruiting,
        program_date,recruitment_start_at,recruitment_deadline,recruitment_details_ready,is_private) VALUES
      (1,'기존 프로그램','legacy',ARRAY['legacy.jpg'],'legacy intro','센터','PROGRAM',true,now()+interval '10 days',null,now()+interval '9 days',false,false),
      (2,'미공개 프로그램','SECRET BODY',ARRAY['SECRET IMAGE'],'SECRET INTRO','SECRET LOCATION','PROGRAM',true,now()+interval '10 days',now()+interval '1 day',now()+interval '9 days',true,false),
      (3,'모집 중','open',ARRAY['open.jpg'],'open intro','센터','PROGRAM',true,now()+interval '10 days',now()-interval '1 day',now()+interval '9 days',true,false),
      (4,'준비 중','DRAFT BODY',null,null,null,'PROGRAM',true,now()+interval '10 days',now()-interval '1 day',now()+interval '9 days',false,false),
      (5,'비공개 예정','PRIVATE BODY',null,null,null,'PROGRAM',true,now()+interval '10 days',now()+interval '1 day',now()+interval '9 days',true,true);
    `);
    const original = (await db.query('SELECT * FROM notices ORDER BY id')).rows;
    await db.exec(readFileSync(new URL('../supabase/migrations/20260831010200_protect_unpublished_programs.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM notices ORDER BY id')).rows,original);
    await db.exec('SET ROLE anon');
    assert.deepEqual((await db.query('SELECT id::int FROM notices ORDER BY id')).rows.map(r=>r.id),[1,3]);
    const previews = (await db.query('SELECT * FROM program_calendar_previews ORDER BY id')).rows;
    assert.deepEqual(previews.map(r=>Number(r.id)),[2,3,4]);
    assert.ok(!JSON.stringify(previews).includes('SECRET'));
    assert.ok(!JSON.stringify(previews).includes('DRAFT BODY'));
    for (const column of ['content','images','program_location','short_description','guest_properties']) {
        await assert.rejects(db.query(`SELECT ${column} FROM program_calendar_previews`),/does not exist/);
    }
    // Follow-up publishes only the explicitly approved card metadata, not
    // the body or application questions. Keep the old migration test intact.
    await db.exec('RESET ROLE');
    await db.exec(readFileSync(new URL('../supabase/migrations/20260831010300_publish_program_card_metadata.sql',import.meta.url),'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM notices ORDER BY id')).rows, original);
    await db.exec('SET ROLE anon');
    const card = (await db.query('SELECT * FROM program_calendar_previews WHERE id=2')).rows[0];
    assert.deepEqual(card.images, ['SECRET IMAGE']);
    assert.equal(card.short_description, 'SECRET INTRO');
    assert.equal(card.program_location, 'SECRET LOCATION');
    assert.equal(card.max_capacity, 30);
    assert.equal(card.is_program_preview, true);
    assert.equal((await db.query('SELECT * FROM program_calendar_previews WHERE id=5')).rows.length, 0);
    for (const column of ['content', 'guest_properties']) {
        await assert.rejects(db.query(`SELECT ${column} FROM program_calendar_previews`), /does not exist/);
    }
    // Direct reads, nested joins and filters cannot reveal protected bodies.
    assert.equal((await db.query("SELECT * FROM notices WHERE content LIKE '%SECRET%'" )).rows.length,0);
    assert.equal((await db.query('SELECT p.id,n.content FROM program_calendar_previews p JOIN notices n USING(id) WHERE p.id=2')).rows.length,0);
    assert.equal((await db.query("UPDATE notices SET recruitment_start_at=now()-interval '1 day' WHERE id=2 RETURNING *")).rows.length,0);
    assert.equal((await db.query("UPDATE notices SET category='NOTICE',is_recruiting=false WHERE id=2 RETURNING *")).rows.length,0);
    assert.equal((await db.query('DELETE FROM notices WHERE id=2 RETURNING *')).rows.length,0);
    await assert.rejects(db.exec("UPDATE program_calendar_previews SET recruitment_start_at=now()-interval '1 day' WHERE id=2"),/permission denied/);
    await assert.rejects(db.exec(`INSERT INTO notices(id,category,is_recruiting,program_date,recruitment_start_at,recruitment_deadline) VALUES (6,'PROGRAM',true,now()+interval '10 days',now()+interval '1 day',now()+interval '9 days')`),/row-level security/);
    // Old deployed clients can still create/edit programs without new fields.
    await db.exec("INSERT INTO notices(id,title,category,is_recruiting) VALUES (7,'기존 화면 등록','PROGRAM',true); UPDATE notices SET title='기존 글 수정' WHERE id=1");
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${student}',false); SET ROLE authenticated`);
    assert.equal((await db.query('SELECT calendar_is_admin() AS allowed')).rows[0].allowed,false);
    // Reproduce the existing broad profile write policy: role/link spoofing
    // must not confer body access or duty-administrator rights.
    await db.exec(`UPDATE public.users SET role='admin',user_group='관리자' WHERE id='${student}'; UPDATE public.users SET auth_user_id='${student}' WHERE id='${admin}'`);
    assert.equal((await db.query('SELECT calendar_is_admin() AS allowed')).rows[0].allowed,false);
    assert.equal((await db.query('SELECT * FROM notices WHERE id=2')).rows.length,0);
    await assert.rejects(db.query('SELECT * FROM calendar_private.admin_identities'),/permission denied/);
    await assert.rejects(db.exec(`INSERT INTO calendar_private.admin_identities(auth_user_id) VALUES('${student}')`),/permission denied/);
    await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${linked}',false); SET ROLE authenticated`);
    assert.equal((await db.query('SELECT calendar_is_admin() AS allowed')).rows[0].allowed,true);
    assert.equal((await db.query('SELECT content FROM notices WHERE id=2')).rows[0].content,'SECRET BODY');
    await db.exec("UPDATE notices SET content='ADMIN UPDATED' WHERE id=2");
    assert.equal((await db.query('SELECT content FROM notices WHERE id=2')).rows[0].content,'ADMIN UPDATED');
    // Publication is evaluated on server time, without copying/moving bodies.
    await db.exec("UPDATE notices SET recruitment_start_at=statement_timestamp() WHERE id=2; RESET ROLE; SET ROLE anon");
    assert.equal((await db.query('SELECT content FROM notices WHERE id=2')).rows[0].content,'ADMIN UPDATED');
    await db.exec('RESET ROLE; SET ROLE service_role');
    assert.equal((await db.query('SELECT content FROM notices WHERE id=4')).rows[0].content,'DRAFT BODY');
    console.log('PASS: originals preserved; raw/embedded/filtered reads blocked; safe previews; write/time/category/role spoofing blocked; legacy writes, verified admin editing and timed publication preserved.');
} finally { await db.close(); }
