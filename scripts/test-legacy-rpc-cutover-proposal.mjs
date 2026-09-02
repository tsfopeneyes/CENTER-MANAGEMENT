import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read=name=>fs.readFile(new URL(`../supabase/manual/proposals/${name}`,import.meta.url),'utf8');
const [cutover,rollback]=await Promise.all([
    read('auth-legacy-rpc-cutover.sql'),read('auth-legacy-rpc-cutover-rollback.sql')
]);
const signatures=['get_login_candidates(text)','legacy_login_sync(text,text)','merge_duplicate_users(uuid,uuid)',
    'merge_guest_to_member(uuid,uuid,jsonb)','upgrade_guest_account(uuid,jsonb,text)'];
for(const signature of signatures){assert.ok(cutover.includes(`public.${signature}`));assert.ok(rollback.includes(`public.${signature}`));}
assert.match(cutover,/to_regprocedure/);assert.match(cutover,/REVOKE EXECUTE[\s\S]*PUBLIC, anon, authenticated/);
assert.match(rollback,/to_regprocedure/);assert.match(rollback,/GRANT EXECUTE[\s\S]*anon, authenticated/);
assert.doesNotMatch(cutover,/DROP|DELETE|TRUNCATE|ALTER TABLE/i);
console.log('PASS legacy auth RPC cutover: exact signatures, absent-function safety, reversible grants, no data/schema mutation');
