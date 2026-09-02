import assert from 'node:assert/strict';
import {createRoleBoundPool} from '../supabase/functions/_shared/roleBoundPool.mjs';

const events=[];let releases=0;
const base={async connect(){return {async query(text,values){events.push({text,values});return {rows:[{ok:true}]};},release(error){assert.equal(error,undefined);releases++;}};}};
const pool=createRoleBoundPool(base,'account_profile_worker');
let result=await pool.query('SELECT $1::text AS value',['safe']);assert.equal(result.rows[0].ok,true);
assert.deepEqual(events.map(e=>e.text),['BEGIN','SET LOCAL ROLE "account_profile_worker"','SELECT $1::text AS value','COMMIT']);assert.equal(releases,1);
events.length=0;const client=await pool.connect();await assert.rejects(client.query('SELECT 1'),/transaction/);await client.query('BEGIN');await client.query('UPDATE public.users SET bio=$1',['x']);await client.query('ROLLBACK');client.release();
assert.deepEqual(events.map(e=>e.text),['BEGIN','SET LOCAL ROLE "account_profile_worker"','UPDATE public.users SET bio=$1','ROLLBACK']);
events.length=0;const reader=await pool.connect();await reader.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await reader.query('SELECT 1');await reader.query('ROLLBACK');reader.release();
assert.equal(events[0].text,'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
assert.throws(()=>createRoleBoundPool(base,'postgres'));assert.throws(()=>createRoleBoundPool(base,'account_profile_worker;RESET ROLE'));
console.log('PASS role-bound pool: NOLOGIN role via transaction-local SET ROLE, no privileged pre-query or role injection');
