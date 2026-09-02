// Standard pg_dump/pg_dumpall + age orchestration. No custom backup format,
// database writes, plaintext backup files, credential arguments, or raw logs.
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash, timingSafeEqual, X509Certificate } from 'node:crypto';
import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_REF = 'erecqalsxoxrufggvmcc';
const root = fileURLToPath(new URL('../', import.meta.url));
const pgBin = path.join(root, 'scratch/backup-tools-17.11/unpacked/pgsql/bin');
const ageBin = path.join(root, 'scratch/backup-age-1.3.2/unpacked/age');
export const cleanEnvironment = (source = process.env) => Object.fromEntries(Object.entries(source)
    .filter(([key]) => /^(path|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|os)$/i.test(key)));
export const databaseEnvironment = (password, certificate, source = process.env) => ({
    ...cleanEnvironment(source), PGHOST: 'aws-1-ap-southeast-1.pooler.supabase.com',
    PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: `postgres.${PROJECT_REF}`,
    PGPASSWORD: password, PGSSLMODE: 'verify-full', PGSSLROOTCERT: certificate,
    PGCONNECT_TIMEOUT: '15', PGAPPNAME: 'sci-encrypted-backup',
    PGOPTIONS: '-c default_transaction_read_only=on -c lock_timeout=10000 -c statement_timeout=300000',
});

// Supavisor may ignore PGOPTIONS. Check the actual transaction, not its
// session default. All SETs here are local to this transaction and rolled back.
export const connectionProbeSql = `BEGIN READ ONLY;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SELECT current_setting('server_version_num'), current_database(),
       current_setting('transaction_read_only'), current_setting('default_transaction_read_only');
ROLLBACK;`;
export const connectionProbeArgs = Object.freeze(['--no-psqlrc', '--no-password', '--quiet',
    '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', connectionProbeSql]);
// PostgreSQL 17 pg_dump starts its own REPEATABLE READ, READ ONLY transaction.
// pg_dumpall --roles-only reads catalogs; unlike pg_dump, it does not open an
// explicit read-only transaction. Never describe the probe as protecting it.
export const databaseDumpArgs = Object.freeze(['--no-password', '--format=custom',
    '--compress=6', '--lock-wait-timeout=10s']);
export const rolesDumpArgs = Object.freeze(['--no-password', '--database=postgres',
    '--roles-only', '--no-role-passwords']);

const failureMessages = Object.freeze({
    'authentication-rejected': '서버가 인증을 거절했습니다. 입력값 또는 서버 인증 상태 확인이 필요합니다.',
    'password-not-supplied': 'DB 비밀번호가 접속 도구에 전달되지 않았습니다.',
    'tls-verification': '서버 인증서 또는 접속 주소 검증에 실패했습니다. 인증서 검사를 끄지 마세요.',
    'network-dns': '서버 주소를 찾지 못했습니다.',
    'network-connect': '서버에 연결하지 못했거나 연결이 끊겼습니다.',
    'connection-timeout': '연결 또는 도구 실행 제한 시간을 초과했습니다.',
    'startup-options': '서버가 읽기 전용 접속 옵션을 받아들이지 않았습니다.',
    'pooler-target': '연결 서버가 프로젝트 또는 DB 사용자를 찾지 못했습니다.',
    'server-unavailable': 'DB 서버가 연결을 받지 못하는 상태입니다.',
    'tool-not-found': '필요한 실행 파일을 찾지 못했습니다.',
    'tool-permission': '로컬 실행 권한이 차단되었습니다.',
    'tool-runtime': '로컬 실행 파일 또는 필수 라이브러리를 시작하지 못했습니다.',
    'readonly-check': '연결은 됐지만 읽기 전용 설정을 확인하지 못했습니다.',
    'target-check': '연결된 DB 이름 또는 버전이 예상과 다릅니다.',
    'database-permission': '백업 대상의 조회 권한이 부족합니다. 권한이나 백업 범위를 임의로 바꾸지 마세요.',
    'tool-failed': '원인 종류를 아직 확인하지 못했습니다. 원본 오류나 비밀번호는 공유하지 마세요.',
});
export function failureCode(error) {
    return Object.hasOwn(failureMessages, error?.backupCode) ? error.backupCode : 'tool-failed';
}
function safeFailure(code) {
    const backupCode = Object.hasOwn(failureMessages, code) ? code : 'tool-failed';
    return Object.assign(new Error(`백업 도구 실행이 실패했습니다. [${backupCode}] ${failureMessages[backupCode]}`), { backupCode });
}

// Only fixed category identifiers leave this function. Never return matched text,
// an upstream message, SQL, a hostname, a username, or a password.
export function classifyDiagnostic(raw, { code, exitCode, timedOut = false } = {}) {
    if (code === 'ENOENT') return 'tool-not-found';
    if (code === 'EACCES' || code === 'EPERM') return 'tool-permission';
    if (timedOut) return 'connection-timeout';
    const message = raw.toString('utf8');
    if (/certificate|root cert|ssl error|tls error/i.test(message)) return 'tls-verification';
    if (/unsupported startup parameter|unrecognized configuration parameter|invalid command.line argument|invalid value for parameter/i.test(message)) return 'startup-options';
    if (/tenant or user not found/i.test(message)) return 'pooler-target';
    if (/password authentication failed|authentication failed|sasl authentication|wrong password|circuit breaker.*authentication/i.test(message)) return 'authentication-rejected';
    if (/no password supplied/i.test(message)) return 'password-not-supplied';
    if (/permission denied|must be (owner|superuser)|insufficient privilege/i.test(message)) return 'database-permission';
    if (/could not translate host name|name or service not known|getaddrinfo/i.test(message)) return 'network-dns';
    if (/timeout expired|timed out/i.test(message)) return 'connection-timeout';
    if (/too many clients|remaining connection slots|database system is (starting|shutting)|maxclients|max client connections/i.test(message)) return 'server-unavailable';
    if (/connection refused|network is unreachable|connection reset|server closed the connection|could not connect to server/i.test(message)) return 'network-connect';
    // Windows STATUS_DLL_NOT_FOUND / ENTRYPOINT_NOT_FOUND / INVALID_IMAGE_FORMAT.
    if ([0xc0000135, 0xc0000139, 0xc000007b].includes(exitCode >>> 0)) return 'tool-runtime';
    return 'tool-failed';
}

export function assertConnectionProbe(probe) {
    const [version, database, readonly, defaultReadonly, ...extra] = probe.toString('utf8').trim().split('|');
    if (!/^17\d{4}$/.test(version) || database !== 'postgres'
        || !['on', 'off'].includes(defaultReadonly) || extra.length) throw safeFailure('target-check');
    if (readonly !== 'on') throw safeFailure('readonly-check');
    return { transaction_read_only: true, session_default_read_only: defaultReadonly === 'on' };
}

export function child(binary, args, { env = cleanEnvironment(), interactive = false, diagnose = false } = {}) {
    let proc;
    try {
        proc = spawn(binary, args, { env, windowsHide: !interactive,
            stdio: ['pipe', 'pipe', interactive ? 'inherit' : 'pipe'] });
    } catch (error) {
        throw safeFailure(classifyDiagnostic(Buffer.alloc(0), { code: error.code }));
    }
    // Collect at most 16 KiB in memory only when requested, classify on exit,
    // and zero the buffers. All other diagnostics are discarded, never logged.
    const diagnosticChunks = []; let diagnosticBytes = 0; let code; let timedOut = false;
    let diagnosticCode = 'tool-failed';
    if (diagnose && proc.stderr) proc.stderr.on('data', chunk => {
        const keep = Math.min(chunk.length, 16 * 1024 - diagnosticBytes);
        if (keep > 0) { diagnosticChunks.push(Buffer.from(chunk.subarray(0, keep))); diagnosticBytes += keep; }
    });
    else proc.stderr?.resume();
    const timer = setTimeout(() => { timedOut = true; proc.kill(); }, interactive ? 15 * 60_000 : 10 * 60_000);
    timer.unref();
    const done = new Promise(resolve => {
        proc.once('error', error => { code = error.code; });
        proc.once('close', exitCode => {
            clearTimeout(timer);
            const diagnostic = Buffer.concat(diagnosticChunks);
            diagnosticCode = classifyDiagnostic(diagnostic, { code, exitCode, timedOut });
            diagnostic.fill(0); diagnosticChunks.forEach(chunk => chunk.fill(0));
            diagnosticChunks.length = 0;
            resolve(exitCode ?? -1);
        });
    });
    return { proc, done, diagnosticCode: () => diagnosticCode };
}

export async function capture(binary, args, { input, maxBytes = 8 * 1024 * 1024, ...options } = {}) {
    const handle = child(binary, args, options);
    const chunks = []; let size = 0;
    const sink = new Writable({ write(chunk, _encoding, next) {
        size += chunk.length;
        if (size > maxBytes) return next(new Error('Output limit exceeded'));
        chunks.push(Buffer.from(chunk)); next();
    } });
    try {
        const writes = pipeline(handle.proc.stdout, sink);
        handle.proc.stdin.on('error', () => {});
        handle.proc.stdin.end(input);
        const [, code] = await Promise.all([writes, handle.done]);
        if (code !== 0) throw new Error('Command failed');
        return Buffer.concat(chunks);
    } catch {
        handle.proc.kill(); await handle.done;
        throw safeFailure(handle.diagnosticCode());
    }
}

function meter() {
    const hash = createHash('sha256'); let bytes = 0;
    return { stream: new Transform({ transform(chunk, _encoding, next) {
        hash.update(chunk); bytes += chunk.length; next(null, chunk);
    } }), result: () => ({ bytes, sha256: hash.digest('hex') }) };
}

export async function encryptProducer({ binary, args, env, age, recipient, output }) {
    const source = child(binary, args, { env, diagnose: true });
    const encryptor = child(age, ['--encrypt', '--recipient', recipient]);
    const digest = meter();
    source.proc.stdin.end();
    try {
        const results = await Promise.all([
            pipeline(source.proc.stdout, digest.stream, encryptor.proc.stdin),
            pipeline(encryptor.proc.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 })),
            source.done, encryptor.done,
        ]);
        if (results[2] !== 0 || results[3] !== 0) throw new Error('Incomplete export');
        const result = digest.result();
        if (!result.bytes) throw new Error('Empty export');
        return result;
    } catch {
        source.proc.kill(); encryptor.proc.kill();
        await Promise.all([source.done, encryptor.done]);
        throw Object.assign(new Error('암호화 백업이 완료되지 않았습니다. 부분 파일은 복구용으로 사용하지 마세요.'),
            { backupCode: source.diagnosticCode() });
    }
}

export async function verifyEncrypted({ age, identity, input, expected, restoreBinary }) {
    const decryptor = child(age, ['--decrypt', '--identity', '-', input]);
    const digest = meter();
    const listing = []; let listingSize = 0;
    const inspector = restoreBinary ? child(restoreBinary, ['--list']) : null;
    const discard = new Writable({ write(_chunk, _encoding, next) { next(); } });
    // pg_restore --list may exit after the TOC, before reading table data.
    // Continue draining and hashing the entire decrypted archive in that case.
    // Inspector/decryptor exit codes AND the full byte/hash match remain required.
    let inspectorAccepting = Boolean(inspector);
    inspector?.proc.stdin.on('error', () => { inspectorAccepting = false; });
    inspector?.proc.stdin.on('close', () => { inspectorAccepting = false; });
    const inspectAndDrain = inspector ? new Writable({
        write(chunk, _encoding, next) {
            if (!inspectorAccepting || inspector.proc.stdin.destroyed) return next();
            inspector.proc.stdin.write(chunk, error => {
                if (error) inspectorAccepting = false;
                next();
            });
        },
        final(next) { inspector.proc.stdin.end(); next(); },
    }) : discard;
    const collect = new Writable({ write(chunk, _encoding, next) {
        listingSize += chunk.length;
        if (listingSize > 8 * 1024 * 1024) return next(new Error('Archive index too large'));
        listing.push(Buffer.from(chunk)); next();
    } });
    try {
        decryptor.proc.stdin.on('error', () => {});
        decryptor.proc.stdin.end(identity);
        const results = await Promise.all([
            pipeline(decryptor.proc.stdout, digest.stream, inspectAndDrain),
            inspector ? pipeline(inspector.proc.stdout, collect) : Promise.resolve(),
            decryptor.done, inspector?.done ?? Promise.resolve(0),
        ]);
        if (results[2] !== 0 || results[3] !== 0) throw new Error('Archive unreadable');
        const actual = digest.result();
        if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error('Roundtrip mismatch');
        return Buffer.concat(listing).toString('utf8');
    } catch {
        decryptor.proc.kill(); inspector?.proc.kill();
        await Promise.all([decryptor.done, inspector?.done ?? Promise.resolve()]);
        throw new Error('암호화 파일 읽기 검증에 실패했습니다. 운영 전환을 진행하지 마세요.');
    }
}

export function assertArchiveCoverage(listing) {
    const tables = [['public','users'],['auth','users'],['auth','identities'],['public','logs'],
        ['public','notices'],['public','notice_responses'],['public','haifn_transactions'],
        ['public','school_logs'],['public','duty_logs']];
    for (const [schema, table] of tables) {
        if (!new RegExp(`\\bTABLE DATA ${schema} ${table} `).test(listing)) {
            throw new Error('필수 회원·인증·기록 테이블의 백업 포함 여부를 확인하지 못했습니다.');
        }
    }
}

async function fileDigest(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}

export async function runBackup({ password, certificate, destination }) {
    if (typeof password !== 'string' || !password || password.includes('\0')) throw new Error('DB 비밀번호가 필요합니다.');
    const parent = path.resolve(process.env.LOCALAPPDATA || '', 'SCI-Center-Backups');
    const target = path.resolve(destination);
    if (!process.env.LOCALAPPDATA || !target.startsWith(`${parent}${path.sep}`)
        || path.dirname(target) !== parent || !/^backup-[\w-]+$/.test(path.basename(target))) {
        throw new Error('승인된 로컬 백업 폴더가 아닙니다.');
    }
    if (!(await stat(target)).isDirectory()) throw new Error('보호된 백업 폴더를 먼저 준비해주세요.');
    const certificateData = await readFile(certificate);
    if (certificateData.includes(Buffer.from('PRIVATE KEY'))) throw new Error('서버 CA 인증서만 사용하세요.');
    const cert = new X509Certificate(certificateData);
    if (!cert.ca || Date.parse(cert.validTo) <= Date.now() || Date.parse(cert.validFrom) > Date.now()) {
        throw new Error('유효한 CA 인증서를 확인하지 못했습니다.');
    }
    const age = path.join(ageBin, 'age.exe');
    const keygen = path.join(ageBin, 'age-keygen.exe');
    const pgEnv = databaseEnvironment(password, certificate);
    let identity; let recovered; let phase = 'connection';
    const manifest = { project_ref: PROJECT_REF, started_at: new Date().toISOString(),
        database_restore_verified: false, account_cutover_allowed: false,
        storage_files_included: false, server_secrets_included: false, role_passwords_included: false };
    const statusFile = path.join(target, 'status.json');
    try {
        console.log('1/5 인증서를 확인하고 읽기 전용으로 DB에 접속합니다.');
        const probe = await capture(path.join(pgBin, 'psql.exe'), connectionProbeArgs,
        { env: pgEnv, maxBytes: 1024, diagnose: true });
        manifest.connection_probe = assertConnectionProbe(probe);
        manifest.database_read_mode = 'pg_dump-native-read-only-transaction';
        manifest.roles_read_mode = 'pg_dumpall-roles-only-catalog-reads';
        phase = 'recovery-key';
        console.log('2/5 백업을 여는 별도 암호를 정합니다. DB 비밀번호와 다르게 정하고 비밀번호 관리 앱에 보관하세요.');
        console.log('age의 Enter passphrase / Confirm passphrase 입력 후, 복구 확인을 위해 같은 암호를 다시 입력합니다.');
        identity = await capture(keygen, [], { maxBytes: 4096 });
        const recipient = (await capture(keygen, ['-y'], { input: identity, maxBytes: 4096 })).toString('utf8').trim();
        if (!/^age1[0-9a-z]+$/.test(recipient)) throw new Error('백업 공개키 확인 실패');
        const encryptedKey = await capture(age, ['--encrypt', '--passphrase'], { input: identity, interactive: true, maxBytes: 8192 });
        const keyPath = path.join(target, 'recovery-key.age');
        await writeFile(keyPath, encryptedKey, { flag: 'wx', mode: 0o600 });
        recovered = await capture(age, ['--decrypt', keyPath], { interactive: true, maxBytes: 4096 });
        if (identity.length !== recovered.length || !timingSafeEqual(identity, recovered)) throw new Error('복구 암호 확인 실패');
        phase = 'database-copy';
        console.log('3/5 DB와 역할 설정을 암호화해 저장합니다. 회원·원본 기록을 수정하지 않습니다.');
        const databaseFile = path.join(target, 'database.dump.age');
        const database = await encryptProducer({ binary: path.join(pgBin, 'pg_dump.exe'),
            args: databaseDumpArgs,
            env: pgEnv, age, recipient, output: databaseFile });
        phase = 'roles-copy';
        const rolesFile = path.join(target, 'roles.sql.age');
        const roles = await encryptProducer({ binary: path.join(pgBin, 'pg_dumpall.exe'),
            args: rolesDumpArgs,
            env: pgEnv, age, recipient, output: rolesFile });
        delete pgEnv.PGPASSWORD; password = undefined;
        phase = 'encrypted-readback';
        console.log('4/5 암호화 전후 데이터 일치와 PostgreSQL 백업 목차를 확인합니다.');
        const listing = await verifyEncrypted({ age, identity: recovered, input: databaseFile,
            expected: database, restoreBinary: path.join(pgBin, 'pg_restore.exe') });
        assertArchiveCoverage(listing);
        await verifyEncrypted({ age, identity: recovered, input: rolesFile, expected: roles });
        const files = [];
        for (const name of ['recovery-key.age', 'database.dump.age', 'roles.sql.age']) {
            const file = path.join(target, name);
            files.push({ name, bytes: (await stat(file)).size, sha256: await fileDigest(file) });
        }
        await writeFile(statusFile, JSON.stringify({ ...manifest,
            status: 'encrypted-copy-checked-restore-not-tested', completed_at: new Date().toISOString(),
            recovery_key_readback_verified: true, archive_readback_verified: true, files }, null, 2), { flag: 'wx', mode: 0o600 });
        console.log('5/5 암호화 사본 저장 및 읽기 검증 완료. 실제 DB 복구 검증은 아직 하지 않았습니다.');
        console.log('백업 암호를 별도로 보관하고 이 폴더 전체를 유지하세요. 복구키 파일도 필요합니다.');
        console.log(`저장 위치: ${target}`);
        console.log('운영 로그인 전환·배포는 계속 중지 상태입니다.');
    } catch (error) {
        const reason = failureCode(error);
        await writeFile(statusFile, JSON.stringify({ ...manifest, status: 'incomplete', failed_phase: phase, failed_reason: reason }, null, 2),
            { flag: 'wx', mode: 0o600 }).catch(() => {});
        throw new Error(`백업이 완료되지 않았습니다 (${phase} / ${reason}). ${failureMessages[reason]} 비밀번호는 공유하지 마세요.`);
    } finally {
        delete pgEnv.PGPASSWORD; password = undefined;
        identity?.fill(0); recovered?.fill(0);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        let input = ''; // Private stdin from the local PowerShell prompt; never log.
        for await (const chunk of process.stdin) {
            input += chunk.toString('utf8');
            if (Buffer.byteLength(input) > 65536) throw new Error('입력 크기를 확인해주세요.');
        }
        const config = JSON.parse(input); input = '';
        await runBackup(config); config.password = undefined;
    } catch (error) {
        // Never render parser/OS/upstream messages: input may contain secrets.
        const message = error?.message?.startsWith('백업이 완료되지 않았습니다') ? error.message
            : '백업 준비 또는 실행을 완료하지 못했습니다. 설정을 확인해주세요. 비밀번호는 공유하지 마세요.';
        console.error(message); process.exitCode = 1;
    }
}
