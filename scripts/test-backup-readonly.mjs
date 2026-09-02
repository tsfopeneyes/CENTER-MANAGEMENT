// Native PostgreSQL verification with synthetic data on loopback only.
// Never loads .env, production credentials, or a production database URL.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture, child, cleanEnvironment, connectionProbeArgs,
    assertConnectionProbe, databaseDumpArgs, rolesDumpArgs, encryptProducer,
    verifyEncrypted, assertArchiveCoverage } from './encrypted-db-backup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bin = path.join(root, 'scratch/backup-tools-17.11/unpacked/pgsql/bin');
const ageBin = path.join(root, 'scratch/backup-age-1.3.2/unpacked/age');
const dir = await mkdtemp(path.join(root, 'scratch/backup-readonly-test-'));
const data = path.join(dir, 'data');
const listener = net.createServer();
await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
});
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const env = { ...cleanEnvironment(), PGHOST:'127.0.0.1', PGPORT:String(port),
    PGUSER:'postgres', PGDATABASE:'postgres', PGSSLMODE:'disable', PGCONNECT_TIMEOUT:'2', PGCLIENTENCODING:'UTF8' };
const localCapture = (name, args, options = {}) => capture(path.join(bin, `${name}.exe`), args,
    { env, diagnose:true, ...options });
const sql = (query, options = {}) => localCapture('psql', ['-X', '-w', '-Atq',
    '--set', 'ON_ERROR_STOP=1', '--file', '-'], {input:Buffer.from(query), ...options});
let server; let serverClosed = false; let identity;
const logs = [];
try {
    await localCapture('initdb', ['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
    // The fresh cluster starts with read/write defaults, reproducing a pooler
    // that does not forward PGOPTIONS. No existing cluster is touched.
    server = child(path.join(bin,'postgres.exe'), ['-D',data,'-h','127.0.0.1','-p',String(port),
        '-c','default_transaction_read_only=off','-c','logging_collector=off',
        '-c','log_statement=all','-c','log_line_prefix=APP:%a: ',
        '-c','unix_socket_directories='], { env });
    server.proc.stdout.resume();
    server.proc.stderr.on('data', chunk => logs.push(Buffer.from(chunk)));
    server.done.then(() => { serverClosed = true; });
    for (let attempt=0;;attempt++) {
        try { await sql('SELECT 1'); break; }
        catch { if (serverClosed || attempt>=30) throw new Error('Synthetic PostgreSQL startup failed'); }
        await new Promise(resolve => setTimeout(resolve,200));
    }
    const tables = ['public.users','auth.users','auth.identities','public.logs','public.notices',
        'public.notice_responses','public.haifn_transactions','public.school_logs','public.duty_logs'];
    await sql(`CREATE SCHEMA auth; CREATE ROLE fixture_reader NOLOGIN;
        ${tables.map(table => `CREATE TABLE ${table} (id int PRIMARY KEY, label text);
        INSERT INTO ${table} VALUES (1,'PUBLIC_TEST_한국어');`).join('\n')}`);
    await sql("INSERT INTO public.logs SELECT n, md5(n::text) FROM generate_series(2,25000) n;");
    const before = await sql("SELECT row_to_json(u) FROM public.users u");
    assert.equal((await sql('SHOW default_transaction_read_only')).toString().trim(),'off');
    const probe = await localCapture('psql', connectionProbeArgs, {env:{...env,PGAPPNAME:'probe'}});
    assert.deepEqual(assertConnectionProbe(probe),
        {transaction_read_only:true,session_default_read_only:false});
    // A read/write transaction still fails the guard even with a read-only
    // session default. Test actual server write rejection, not only parsing.
    await assert.rejects(sql("BEGIN READ ONLY; UPDATE public.users SET label='SHOULD_NOT_SAVE'; COMMIT;"));
    assert.deepEqual(await sql("SELECT row_to_json(u) FROM public.users u"),before);
    assert.equal((await sql('SHOW default_transaction_read_only')).toString().trim(),'off');

    identity = await capture(path.join(ageBin,'age-keygen.exe'),[],{maxBytes:4096});
    const recipient = (await capture(path.join(ageBin,'age-keygen.exe'),['-y'],{input:identity})).toString().trim();
    const age = path.join(ageBin,'age.exe');
    const databaseFile = path.join(dir,'synthetic.dump.age');
    const database = await encryptProducer({binary:path.join(bin,'pg_dump.exe'), args:databaseDumpArgs,
        env:{...env,PGAPPNAME:'database-export'},age,recipient,output:databaseFile});
    const rolesFile = path.join(dir,'synthetic.roles.age');
    const roles = await encryptProducer({binary:path.join(bin,'pg_dumpall.exe'),args:rolesDumpArgs,
        env:{...env,PGAPPNAME:'roles-export'},age,recipient,output:rolesFile});
    const listing = await verifyEncrypted({age,identity,input:databaseFile,expected:database,
        restoreBinary:path.join(bin,'pg_restore.exe')});
    assertArchiveCoverage(listing);
    assert.ok((await readFile(databaseFile)).length > 128*1024, 'Exercise early TOC-reader exit on a large archive');
    await assert.rejects(verifyEncrypted({age,identity,input:databaseFile,
        expected:{...database,bytes:database.bytes-1},restoreBinary:path.join(bin,'pg_restore.exe')}),/검증에 실패/);
    const corrupt = await readFile(databaseFile); corrupt[corrupt.length-1] ^= 1;
    const corruptFile = path.join(dir,'synthetic-corrupt.dump.age');
    await writeFile(corruptFile,corrupt,{flag:'wx'});
    await assert.rejects(verifyEncrypted({age,identity,input:corruptFile,
        expected:database,restoreBinary:path.join(bin,'pg_restore.exe')}),/검증에 실패/);
    await verifyEncrypted({age,identity,input:rolesFile,expected:roles});
    const rolesText = (await capture(age,['--decrypt','--identity','-',rolesFile],{input:identity})).toString();
    assert.match(rolesText,/CREATE ROLE fixture_reader;/);
    assert.doesNotMatch(rolesText,/\bPASSWORD\b/);
    assert.deepEqual(await sql("SELECT row_to_json(u) FROM public.users u"),before);
    assert.equal((await sql('SHOW default_transaction_read_only')).toString().trim(),'off');

    await localCapture('pg_ctl',['-D',data,'-w','-t','15','stop','-m','fast']);
    assert.equal(await server.done,0);
    const log = Buffer.concat(logs).toString();
    const statements = log.split(/\r?\n/).filter(line => /APP:(database|roles)-export: .*statement: /.test(line));
    const dumpStatements = statements.filter(line => line.includes('APP:database-export:'));
    const readOnlyIndex = dumpStatements.findIndex(line => /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/.test(line));
    const firstCopyIndex = dumpStatements.findIndex(line => /COPY .* TO stdout/i.test(line));
    assert.ok(readOnlyIndex>=0 && firstCopyIndex>readOnlyIndex, 'Native pg_dump enters READ ONLY before copying data');
    const roleStatements = statements.filter(line => line.includes('APP:roles-export:'));
    assert.ok(roleStatements.some(line => /FROM pg_roles/.test(line)), 'Role export reads the password-free role catalog');
    for (const statement of roleStatements) {
        assert.match(statement,/statement: (?:SELECT|SET)\b/i, 'Role exporter only reads catalogs and sets its session');
    }
    for (const statement of statements) {
        assert.doesNotMatch(statement,/statement: (?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
    }
    await writeFile(path.join(dir,'result.json'),JSON.stringify({synthetic_only:true,
        probe_readonly_verified:true, native_dump_readonly_verified:true,
        role_catalog_reads_verified:true, encrypted_roundtrip_verified:true,
        production_backup_verified:false},null,2),{flag:'wx'});
    console.log('PASS: native PostgreSQL 17 with ignored startup options; explicit probe READ ONLY, rejected writes, native pg_dump READ ONLY before COPY, catalog-only roles export, encrypted native archives, original rows preserved. Loopback synthetic DB only.');
} finally {
    identity?.fill(0);
    if (server && !serverClosed) {
        await localCapture('pg_ctl',['-D',data,'-w','-t','15','stop','-m','fast']).catch(() => server.proc.kill());
        await server.done;
    }
    await writeFile(path.join(dir,'synthetic-server.log'),Buffer.concat(logs),{flag:'wx'});
    // Retain only this run's synthetic files; never delete or move existing DBs.
}
