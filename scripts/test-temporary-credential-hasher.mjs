import assert from 'node:assert/strict';
import {createTemporaryCredentialHasher} from '../supabase/functions/_shared/temporaryCredentialHasher.mjs';

const pepper=new Uint8Array(32).fill(7),salt=new Uint8Array(16).fill(9);
const hasher=createTemporaryCredentialHasher({pepper,iterations:210000,randomBytes:size=>{assert.equal(size,16);return salt.slice();}});
const digest=await hasher.hash('0123');
assert.match(digest,/^v1\.pbkdf2-sha256\.210000\./);
assert.ok(!digest.includes('0123'));
assert.equal(await hasher.verify('0123',digest),true);
assert.equal(await hasher.verify('0124',digest),false);
assert.equal(await createTemporaryCredentialHasher({pepper:new Uint8Array(32).fill(8),iterations:210000}).verify('0123',digest),false);
for(const malformed of ['',digest+'.extra',digest.replace('210000','1'),'v1.bad.210000.x.y'])assert.equal(await hasher.verify('0123',malformed),false);
await assert.rejects(()=>hasher.hash('12345'));
assert.throws(()=>createTemporaryCredentialHasher({pepper:new Uint8Array(8)}),/pepper/i);
console.log('PASS temporary credential hasher: keyed slow digest, salt, strict format, wrong-value and wrong-pepper denial');
