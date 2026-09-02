import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/manual/proposals/auth-storage-cutover.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/manual/proposals/auth-storage-cutover-rollback.sql',import.meta.url),'utf8');
for(const name of ['Allow Public Uploads','Anyone can upload an avatar.','Anyone can update their own avatar.','Anyone can delete their own avatar.'])
    assert.ok(sql.includes(`DROP POLICY IF EXISTS "${name}"`));
assert.match(sql,/REVOKE INSERT, UPDATE, DELETE ON storage\.objects FROM PUBLIC, anon, authenticated/);
assert.ok(!/DROP POLICY[^\n]+Allow Public Select/.test(sql));
assert.ok(!/DROP POLICY[^\n]+Avatar images are publicly accessible/.test(sql));
assert.ok(!/DELETE\s+FROM\s+storage\.objects|UPDATE\s+storage\.objects|TRUNCATE/i.test(sql));
for(const name of ['Allow Public Uploads','Anyone can upload an avatar.','Anyone can update their own avatar.','Anyone can delete their own avatar.'])
    assert.ok(rollback.includes(`CREATE POLICY "${name}"`));
assert.ok(!/DELETE\s+FROM\s+storage\.objects|UPDATE\s+storage\.objects|TRUNCATE/i.test(rollback));
console.log('PASS storage cutover proposal: removes public writes only, preserves public reads and every existing object');
