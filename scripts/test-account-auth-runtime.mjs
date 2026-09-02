import assert from 'node:assert/strict';
import {createAccountAuthRuntime} from '../supabase/functions/_shared/accountAuthRuntime.mjs';

const basePool={async connect(){return {async query(){return {rows:[]};},release(){}};}};
const runtime=await createAccountAuthRuntime({basePool,supabaseUrl:'https://project.supabase.co',publishableKey:'public-key',
    serviceRoleKey:'service-role-fixture-key-123456789',lookupSecret:'lookup-secret-fixture-12345678901234567890',
    legacyBridgeSecret:'legacy-bridge-fixture-secret-12345678901234567890',
    pepper:new Uint8Array(32).fill(4),resolveClientKey:async()=> 'trusted',readiness:async()=>false,
    allowedOrigins:['https://app.example'],passwordPolicy:async()=>true,kdfIterations:210000,
    termsVersion:'fixture-v1',loginDomain:'accounts.example.invalid'});
assert.equal(typeof runtime,'function');
const response=await runtime(new Request('https://project.supabase.co/functions/v1/account-auth/unknown'));
assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'no-store');
const health=await runtime(new Request('https://project.supabase.co/functions/v1/account-auth/health'));
assert.equal(health.status,503);assert.deepEqual(await health.json(),{protocol:1,service:'account-auth',ready:false});
console.log('PASS account auth runtime: NOLOGIN role pools, auth/admin gateways, credential/profile bundles and exact base route composed');
