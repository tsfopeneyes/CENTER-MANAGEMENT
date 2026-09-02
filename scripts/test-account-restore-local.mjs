// Synthetic data only. Verifies native Windows initdb/password + dump/restore path.
import {mkdtemp,writeFile,unlink,readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {capture,child,cleanEnvironment} from './encrypted-db-backup.mjs';
const bin=path.resolve('scratch/backup-tools-17.11/unpacked/pgsql/bin');
const work=await mkdtemp(path.resolve('scratch')+path.sep+'restore-synthetic-');
const data=path.join(work,'data');
const listener=net.createServer();
await new Promise(r=>listener.listen(0,'127.0.0.1',r));
const port=listener.address().port;
await new Promise(r=>listener.close(r));
const env={...cleanEnvironment(),PGHOST:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGDATABASE:'postgres',
    PGPASSWORD:randomBytes(32).toString('hex'),PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'2',PGCLIENTENCODING:'UTF8'};
const run=(name,args,options={})=>capture(path.join(bin,name+'.exe'),args,{env,...options});
const sql=input=>run('psql',['-X','-w','-Atq','--set','ON_ERROR_STOP=1','--file','-'],{input:Buffer.isBuffer(input)?input:Buffer.from(input)});
let server;
try {
    const pw=path.join(work,'synthetic-password');
    try {await writeFile(pw,env.PGPASSWORD+'\n',{flag:'wx'});
        await run('initdb',['-D',data,'-U','postgres','--auth=scram-sha-256','--pwfile='+pw,'--encoding=UTF8','--no-locale']);
    } finally {await unlink(pw);}
    await assert.rejects(readFile(pw));
    server=child(path.join(bin,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port),'-c','unix_socket_directories='],{env});
    server.proc.stdout.resume();
    for(let i=0;;i++){try{await sql('SELECT 1');break;}catch{if(i>=40)throw Error('startup');await new Promise(r=>setTimeout(r,200));}}
    await assert.rejects(run('psql',['-X','-w','-c','SELECT 1'],{env:{...env,PGPASSWORD:'INCORRECT_SYNTHETIC_PASSWORD'}}));
    await sql(`CREATE SCHEMA auth; CREATE SCHEMA extensions;
        CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
        CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT extensions.uuid_generate_v4()';
        CREATE TABLE auth.users(id uuid, name text); CREATE TABLE auth.identities(id uuid,user_id uuid);
        CREATE TABLE public.users(id uuid DEFAULT extensions.uuid_generate_v4(),auth_user_id uuid,name text);
        INSERT INTO public.users(name) VALUES('가상 회원');
        INSERT INTO auth.users SELECT id,name FROM public.users;
        INSERT INTO auth.identities SELECT id,id FROM public.users;`);
    const dump=await run('pg_dump',['-w','--format=custom']);
    const listing=(await run('pg_restore',['--list'],{input:dump})).toString();
    const selected=listing.split(/\r?\n/).filter(line=>/^\d+; \d+ \d+ (TABLE|TABLE DATA) (auth (users|identities)|public users) /.test(line));
    assert.equal(selected.length,6);
    const list=path.join(work,'synthetic-list.txt'); await writeFile(list,selected.join('\n'));
    const restored=await run('pg_restore',['--use-list',list,'--no-owner','--no-privileges','--file','-'],{input:dump});
    await sql('DROP TABLE auth.identities,auth.users,public.users;');
    await sql(restored);
    assert.equal((await sql('SELECT name FROM public.users')).toString().trim(),'가상 회원');
    assert.equal((await sql('SELECT count(*) FROM auth.identities')).toString().trim(),'1');
    console.log('PASS: initdb password file cleanup, password enforcement, extensions, six TOC entries, three-table restore, Korean data.');
} finally {
    if(server){await run('pg_ctl',['-D',data,'-w','-t','15','stop','-m','fast']);await server.done;}
    delete env.PGPASSWORD;
}
