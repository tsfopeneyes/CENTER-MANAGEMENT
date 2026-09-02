// Scoped restore rehearsal. Never connects to production. No plaintext dump files.
import { readFile, writeFile, realpath, unlink } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { capture, child, cleanEnvironment } from './encrypted-db-backup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bin = path.join(root, 'scratch/backup-tools-17.11/unpacked/pgsql/bin');
const age = path.join(root, 'scratch/backup-age-1.3.2/unpacked/age/age.exe');
const backup = await realpath(path.resolve(process.argv[2] || ''));
const work = await realpath(path.resolve(process.argv[3] || ''));
const base = await realpath(path.join(process.env.LOCALAPPDATA, 'SCI-Center-Backups'));
if (!backup.startsWith(base + path.sep) || !work.startsWith(base + path.sep)
    || !path.basename(work).startsWith('restore-check-') || backup === work) throw Error('Invalid local restore paths');
const data = path.join(work, 'data');
const report = { started_at: new Date().toISOString(), scope: ['auth.users','auth.identities','public.users'],
    full_database_restore_verified: false, account_cutover_allowed: false, status: 'incomplete' };
let key, dump, restoredSql, server, port, env, phase = 'file-integrity';
const run = (name, args, options={}) => capture(path.join(bin, name+'.exe'), args, {env, ...options});
const sql = input => run('psql', ['-X','-w','-Atq','--set','ON_ERROR_STOP=1','--file','-'],
    {input: Buffer.isBuffer(input) ? input : Buffer.from(input), maxBytes: 4096});
try {
    const manifest = JSON.parse(await readFile(path.join(backup,'status.json'),'utf8'));
    if (manifest.project_ref !== 'erecqalsxoxrufggvmcc' || manifest.status !== 'encrypted-copy-checked-restore-not-tested') throw Error('Invalid backup');
    for (const name of ['database.dump.age','recovery-key.age','roles.sql.age']) {
        const expected = manifest.files.find(f=>f.name===name);
        const bytes = await readFile(path.join(backup,name));
        if (!expected || bytes.length!==expected.bytes || createHash('sha256').update(bytes).digest('hex')!==expected.sha256) throw Error('Integrity mismatch');
    }
    phase='prepare-local-database';
    const listener=net.createServer();
    await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
    port=listener.address().port;
    await new Promise(resolve=>listener.close(resolve));
    env={...cleanEnvironment(),PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGDATABASE:'postgres',
        PGPASSWORD:randomBytes(32).toString('hex'),PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'2',PGCLIENTENCODING:'UTF8'};
    // initdb does not accept '-' as stdin for --pwfile. This random local-only
    // credential inherits the private work directory ACL and is removed immediately.
    const localPasswordFile=path.join(work,'local-init-password');
    try {
        await writeFile(localPasswordFile,env.PGPASSWORD+'\n',{flag:'wx',mode:0o600});
        await run('initdb',['-D',data,'-U','postgres','--auth=scram-sha-256','--pwfile='+localPasswordFile,'--encoding=UTF8','--no-locale']);
    } finally {await unlink(localPasswordFile).catch(()=>{});}
    server=child(path.join(bin,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),
        '-c','unix_socket_directories=','-c','logging_collector=off','-c','log_statement=none',
        '-c','log_min_error_statement=panic'],{env});
    server.proc.stdout.resume();
    for(let attempt=0;;attempt++) {try {await sql('SELECT 1');break;}catch{if(attempt>=40)throw Error('Local startup failed');await new Promise(r=>setTimeout(r,200));}}
    phase='decrypt';
    console.log('1/4 임시 DB 준비 완료. 16:59에 백업을 만들 때 정한 별도 백업 암호를 입력하세요.');
    console.log('DB 비밀번호가 아닙니다. 저장해 둔 암호를 그대로 붙여넣을 수 있습니다. 입력은 화면에 표시되지 않습니다.');
    for (let attempt=1; attempt<=3; attempt++) {
        try {
            key = await capture(age,['--decrypt',path.join(backup,'recovery-key.age')],{interactive:true,maxBytes:4096});
            break;
        } catch (error) {
            if (attempt===3) throw error;
            console.log('복호화되지 않았습니다. 임시 DB는 준비된 상태로 유지합니다.');
            console.log('저장해 둔 백업 암호와 한/영·Caps Lock 상태를 확인한 뒤 다시 입력하세요. 3회 실패하면 시험 DB를 종료합니다.');
        }
    }
    dump = await capture(age,['--decrypt','--identity','-',path.join(backup,'database.dump.age')],{input:key,maxBytes:128*1024*1024});
    key.fill(0);
    console.log('2/4 격리된 로컬 DB에 회원·로그인 계정 테이블을 복원합니다.');
    phase='restore-account-tables';
    const listing=(await run('pg_restore',['--list'],{input:dump})).toString();
    const selected=listing.split(/\r?\n/).filter(line=> /^\d+; \d+ \d+ (TABLE|TABLE DATA) (auth (users|identities)|public users) /.test(line));
    if(selected.length!==6)throw Error('Expected three schemas and three data entries');
    const listFile=path.join(work,'restore-list.txt');
    await writeFile(listFile,selected.join('\n'),{flag:'wx'});
    await sql(`CREATE SCHEMA auth; CREATE SCHEMA extensions;
        CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
        CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT extensions.uuid_generate_v4()';`);
    restoredSql=await run('pg_restore',['--use-list',listFile,'--no-owner','--no-privileges','--file','-'],{input:dump,maxBytes:128*1024*1024});
    // Errors are never printed: SQL may contain personal information.
    await sql(restoredSql);
    phase='verify-restored-records';
    const counts=JSON.parse((await sql(`SELECT json_build_object('profiles',(SELECT count(*) FROM public.users),'auth_accounts',(SELECT count(*) FROM auth.users),'identities',(SELECT count(*) FROM auth.identities),'unlinked_auth',(SELECT count(*) FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE u.id=a.id OR u.auth_user_id=a.id)),'duplicate_auth_ids',(SELECT count(*)-count(DISTINCT id) FROM auth.users),'orphan_identities',(SELECT count(*) FROM auth.identities i WHERE NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=i.user_id)));`)).toString());
    // Counts are expected to change as the live service is used and reviewed
    // orphan Auth accounts are removed. Validate the restored snapshot's own
    // relational invariants instead of comparing it with a stale historical
    // inventory from an older backup.
    if(!Number.isSafeInteger(counts.profiles)||counts.profiles<1||
        !Number.isSafeInteger(counts.auth_accounts)||counts.auth_accounts<1||
        counts.identities!==counts.auth_accounts||counts.profiles<counts.auth_accounts||
        counts.unlinked_auth<0||counts.duplicate_auth_ids!==0||counts.orphan_identities!==0)
        throw Error('Restored account invariants failed');
    report.counts=counts; report.account_table_restore_verified=true;
    report.status='account-tables-restored-full-database-not-tested';
    console.log(`3/4 회원 ${counts.profiles}개·로그인 계정 ${counts.auth_accounts}개 복원 및 관계 무결성 확인 완료.`);
} catch {
    report.failed_phase=phase;
    console.log('복구 시험 중단: '+phase+'. 운영 계정은 변경하지 않았습니다.');
    process.exitCode=1;
} finally {
    key?.fill(0);dump?.fill(0);restoredSql?.fill(0);
    if(server) {
        try {await run('pg_ctl',['-D',data,'-w','-t','15','stop','-m','fast']);await server.done;report.local_server_stopped=true;}
        catch {server.proc.kill();await server.done;report.local_server_stopped=false;report.status='incomplete';process.exitCode=1;}
    }
    if(env)delete env.PGPASSWORD;
    report.completed_at=new Date().toISOString();
    await writeFile(path.join(work,'restore-status.json'),JSON.stringify(report,null,2),{flag:'wx'});
    console.log('4/4 결과 기록 완료. 전체 DB·권한·서비스 복구 시험을 대신하지 않습니다.');
}
