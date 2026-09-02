import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, X509Certificate } from 'node:crypto';
import { capture, encryptProducer, verifyEncrypted, assertArchiveCoverage,
    cleanEnvironment, databaseEnvironment, classifyDiagnostic, failureCode, assertConnectionProbe } from './encrypted-db-backup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const ageDir = path.join(root, 'scratch/backup-age-1.3.2/unpacked/age');
const age = path.join(ageDir, 'age.exe');
const testDir = await mkdtemp(path.join(root, 'scratch/backup-pipeline-test-'));
let identity;
try {
    const env = databaseEnvironment('TEST_ONLY_PASSWORD', 'TEST_ONLY_CERTIFICATE', {
        PATH: process.env.PATH, PGSERVICE: 'BAD', PGSSLMODE: 'disable', PGPASSWORD: 'OLD',
        PGOPTIONS: 'unsafe', SUPABASE_SERVICE_ROLE_KEY: 'TEST_ONLY_SECRET', NODE_OPTIONS: 'BAD',
    });
    assert.equal(env.PGSSLMODE, 'verify-full');
    assert.equal(env.PGPASSWORD, 'TEST_ONLY_PASSWORD');
    assert.equal(env.PGPORT, '5432');
    assert.equal(env.PGUSER, 'postgres.erecqalsxoxrufggvmcc');
    assert.ok(env.PGOPTIONS.includes('default_transaction_read_only=on'));
    assert.ok(!('PGSERVICE' in env));
    assert.ok(!('NODE_OPTIONS' in env));
    assert.ok(!('SUPABASE_SERVICE_ROLE_KEY' in env));

    const diagnostics = [
        ['FATAL: password authentication failed for user "PRIVATE_USER"', 'authentication-rejected'],
        ['fe_sendauth: no password supplied', 'password-not-supplied'],
        ['SSL error: certificate verify failed', 'tls-verification'],
        ['could not translate host name "PRIVATE_HOST" to address', 'network-dns'],
        ['connection refused', 'network-connect'],
        ['timeout expired', 'connection-timeout'],
        ['unsupported startup parameter: options', 'startup-options'],
        ['Tenant or user not found', 'pooler-target'],
        ['remaining connection slots are reserved', 'server-unavailable'],
        ['permission denied for table PRIVATE_TABLE', 'database-permission'],
        ['PRIVATE_UNKNOWN_ERROR', 'tool-failed'],
    ];
    for (const [message, expected] of diagnostics) assert.equal(classifyDiagnostic(Buffer.from(message)), expected);
    assert.equal(classifyDiagnostic(Buffer.alloc(0), {code:'EPERM'}), 'tool-permission');
    assert.equal(classifyDiagnostic(Buffer.alloc(0), {code:'ENOENT'}), 'tool-not-found');
    assert.equal(classifyDiagnostic(Buffer.alloc(0), {exitCode:0xc0000135}), 'tool-runtime');
    assert.equal(classifyDiagnostic(Buffer.alloc(0), {timedOut:true}), 'connection-timeout');
    assert.equal(failureCode({backupCode:'PRIVATE_UNEXPECTED_CODE'}), 'tool-failed');
    assert.equal(failureCode({backupCode:'constructor'}), 'tool-failed');
    assert.deepEqual(assertConnectionProbe(Buffer.from('170006|postgres|on|off\r\n')),
        {transaction_read_only:true, session_default_read_only:false});
    assert.deepEqual(assertConnectionProbe(Buffer.from('170006|postgres|on|on\r\n')),
        {transaction_read_only:true, session_default_read_only:true});
    for (const defaultValue of ['on','off']) {
        assert.throws(() => assertConnectionProbe(Buffer.from(`170006|postgres|off|${defaultValue}`)), error => failureCode(error)==='readonly-check');
    }
    assert.throws(() => assertConnectionProbe(Buffer.from('180000|postgres|on|off')), error => failureCode(error)==='target-check');
    assert.throws(() => assertConnectionProbe(Buffer.from('170006|other|on|off')), error => failureCode(error)==='target-check');
    assert.throws(() => assertConnectionProbe(Buffer.from('170006|postgres|on|unexpected')), error => failureCode(error)==='target-check');
    assert.throws(() => assertConnectionProbe(Buffer.from('170006|postgres|on|off|extra')), error => failureCode(error)==='target-check');
    assert.throws(() => assertConnectionProbe(Buffer.from('170006|postgres|on')), error => failureCode(error)==='target-check');
    await assert.rejects(capture(process.execPath, ['-e',
        "process.stderr.write('FATAL: pass');setTimeout(()=>{process.stderr.write('word authentication failed PRIVATE_PASSWORD PRIVATE_SQL');process.exitCode=1},30)"],
        {diagnose:true}), error => failureCode(error)==='authentication-rejected' && !JSON.stringify(error).includes('PRIVATE') && !error.message.includes('PRIVATE'));
    await assert.rejects(capture(path.join(testDir,'nonexistent-program.exe'),[], {diagnose:true}),
        error => failureCode(error)==='tool-not-found' && !error.message.includes(testDir));
    await assert.rejects(capture(process.execPath, ['-e',
        "process.stderr.write('PRIVATE_'.repeat(10000));process.exitCode=1"], {diagnose:true}),
        error => failureCode(error)==='tool-failed' && !error.message.includes('PRIVATE_'));

    identity = await capture(path.join(ageDir, 'age-keygen.exe'), [], { maxBytes: 4096 });
    const recipient = (await capture(path.join(ageDir, 'age-keygen.exe'), ['-y'], { input: identity })).toString().trim();
    const output = path.join(testDir, 'fixture.age');
    // Public synthetic bytes only. No database, live credentials, or network.
    const expectedBytes = Buffer.concat([Buffer.from('PUBLIC_TEST_FIXTURE_한국어\0\r\n'), Buffer.from(Array.from({length:256},(_,i)=>i))]);
    const encoded = expectedBytes.toString('base64');
    const digest = await encryptProducer({ binary: process.execPath,
        args: ['-e', `process.stdout.write(Buffer.from('${encoded}','base64'))`],
        env: cleanEnvironment(), age, recipient, output });
    assert.equal(digest.bytes, expectedBytes.length);
    assert.equal(digest.sha256, createHash('sha256').update(expectedBytes).digest('hex'));
    assert.ok((await readFile(output)).subarray(0,32).toString().startsWith('age-encryption.org/v1'));
    assert.ok(!(await readFile(output)).includes(expectedBytes));
    await verifyEncrypted({ age, identity, input: output, expected: digest });
    await assert.rejects(verifyEncrypted({ age, identity, input: output, expected: {...digest, bytes:digest.bytes+1} }), /검증에 실패/);

    const previous = await readFile(output);
    await assert.rejects(encryptProducer({ binary:process.execPath, args:['-e',"process.stdout.write('NEW')"],
        env:cleanEnvironment(),age,recipient,output }), /완료되지 않았습니다/);
    assert.deepEqual(await readFile(output), previous, 'Existing backup must never be overwritten');
    const failed = path.join(testDir, 'failed.age');
    await assert.rejects(encryptProducer({ binary:process.execPath,
        args:['-e',"process.stdout.write('PARTIAL_TEST');process.stderr.write('DO_NOT_LOG_PRIVATE_ERROR');process.exitCode=7"],
        env:cleanEnvironment(),age,recipient,output:failed }), /완료되지 않았습니다/);
    await assert.rejects(encryptProducer({ binary:process.execPath,
        args:['-e',"process.stderr.write('permission denied for table PRIVATE_TABLE');process.exitCode=1"],
        env:cleanEnvironment(),age,recipient,output:path.join(testDir,'denied.age') }),
        error => failureCode(error)==='database-permission' && !error.message.includes('PRIVATE_TABLE'));
    const corrupt = Buffer.from(previous); corrupt[corrupt.length-1] ^= 1;
    const corruptFile = path.join(testDir, 'corrupt.age');
    await writeFile(corruptFile,corrupt,{flag:'wx'});
    await assert.rejects(verifyEncrypted({age,identity,input:corruptFile,expected:digest}),/검증에 실패/);
    await assert.rejects(verifyEncrypted({age,identity,input:output,expected:digest,
        restoreBinary:path.join(root,'scratch/backup-tools-17.11/unpacked/pgsql/bin/pg_restore.exe')}),/검증에 실패/);
    const names = ['public users','auth users','auth identities','public logs','public notices',
        'public notice_responses','public haifn_transactions','public school_logs','public duty_logs'];
    const listing = names.map((name,index)=>`${index}; 0 1 TABLE DATA ${name} postgres`).join('\n');
    assertArchiveCoverage(listing);
    assert.throws(()=>assertArchiveCoverage(listing.replace('TABLE DATA auth users','OMITTED auth users')),/필수/);
    assert.equal((await stat(path.join(testDir,'status.json')).catch(()=>null)),null);
    const cert = new X509Certificate(await readFile('C:/Users/Jin/Downloads/prod-ca-2021.crt'));
    assert.equal(cert.ca,true); assert.ok(Date.parse(cert.validTo)>Date.now());
    console.log('PASS: safe bounded diagnostic categories, connection assertions, real age binary encryption/decryption, binary byte preservation, TLS/read-only/env isolation, no overwrite, failed producer, tamper and invalid archive rejection. Synthetic data only; no live DB used.');
    console.log('Interactive passphrase entry and actual database restore still require separate verification.');
} finally { identity?.fill(0); }
