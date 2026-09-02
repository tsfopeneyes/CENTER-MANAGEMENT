import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createAccountAuthorization,validateSelfProfileUpdate} from '../supabase/functions/_shared/accountAuthorization.mjs';
import {createSessionSnapshot,createSessionReadStore} from '../supabase/functions/_shared/sessionReadStore.mjs';
const db=new PGlite(),query=(sql,args)=>db.query(sql,args);
let releases=0,connections=0;
const pool={async connect(){connections++;return {query,release(){releases++;}};}};
const a=crypto.randomUUID(),b=crypto.randomUUID(),p=crypto.randomUUID(),q=crypto.randomUUID(),sa=crypto.randomUUID(),sb=crypto.randomUUID();
const tokens={a:{authUserId:a,sessionId:sa},b:{authUserId:b,sessionId:sb}},providerRevoked=new Set();
const verifyToken=async(token)=>{
    const ids=tokens[token];if(!ids||providerRevoked.has(token))return null;
    const live=await createSessionReadStore(query).loadLiveSession(ids.sessionId,ids.authUserId);
    return live?{...ids,live:live.live,isAnonymous:false,expiresAt:Date.now()+3600000}:null;
};
const authorize=createAccountAuthorization({snapshot:createSessionSnapshot(pool),verifyToken});
const invoke=(token,action,target,extra={})=>authorize({accessToken:token,action,targetProfileId:target,...extra});
const deny=(token,action,target,code='forbidden',extra={})=>assert.rejects(invoke(token,action,target,extra),e=>e.code===code);
const owner=async(work)=>{await db.exec('RESET ROLE');try{return await work();}finally{await db.exec('SET ROLE account_session_reader');}};
try{
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
        CREATE TABLE public.users(id uuid PRIMARY KEY,name text,role text,school text,user_group text,phone text,phone_back4 text);
        CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean,banned_until timestamptz);
        CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);`);
    for(const file of ['auth-session-foundation','auth-login-foundation','auth-credential-foundation','auth-roles-foundation'])await db.exec(readFileSync(new URL('../supabase/manual/proposals/'+file+'.sql',import.meta.url),'utf8'));
    await query("INSERT INTO public.users(id,name,role) VALUES($1,'actual admin','user'),($2,'admin','admin')",[p,q]);
    await query('INSERT INTO auth.users VALUES($1,false,NULL),($2,false,NULL)',[a,b]);
    await query('INSERT INTO auth.sessions VALUES($1,$2,NULL),($3,$4,NULL)',[sa,a,sb,b]);
    await query("INSERT INTO account_security.accounts VALUES($1,$2,true,'active',1,false),($3,$4,true,'active',1,false)",[p,a,q,b]);
    await query("INSERT INTO account_security.session_assurances VALUES($1,$2,$3,1,'trusted',now()+interval '1 hour'),($4,$5,$6,1,'trusted',now()+interval '1 hour')",[sa,a,p,sb,b,q]);
    await query("INSERT INTO account_security.account_roles VALUES($1,'admin',true)",[p]);
    await db.exec('SET ROLE account_session_reader');
    assert.equal((await invoke('b','profile.update-self',q)).actorProfileId,q);
    await deny('b','profile.update-self',p);
    await deny('b','credentials.reset',p,'forbidden',{role:'admin',name:'admin',is_master:true});
    assert.equal((await invoke('a','credentials.reset',q)).actorProfileId,p);
    assert.equal((await invoke('a','members.manage',q)).targetProfileId,q);
    await deny('a','unrecognized.action',q);
    await deny('unknown','members.manage',q,'invalid_login');
    await assert.rejects(query("UPDATE account_security.account_roles SET role='admin'"),/permission denied/);
    await owner(()=>query("UPDATE account_security.account_roles SET enabled=false WHERE profile_id=$1",[p]));
    await deny('a','members.manage',q);
    await owner(()=>query("UPDATE account_security.account_roles SET enabled=true,role='staff' WHERE profile_id=$1",[p]));
    await deny('a','members.manage',q);
    await owner(()=>query("UPDATE account_security.account_roles SET role='admin' WHERE profile_id=$1",[p]));
    await owner(()=>query("UPDATE account_security.accounts SET credential_version=2 WHERE profile_id=$1",[p]));
    await deny('a','members.manage',q,'invalid_login');
    await owner(()=>query("UPDATE account_security.accounts SET credential_version=1,must_change_password=true WHERE profile_id=$1",[p]));
    await deny('a','members.manage',q);
    providerRevoked.add('b'); // official Auth API rejects this bearer
    await deny('b','profile.read-self',q,'invalid_login');
    assert.equal(connections,releases);
    await db.exec('RESET ROLE');
    for(const role of ['anon','authenticated']){
        await db.exec('SET ROLE '+role);
        await assert.rejects(query('SELECT * FROM account_security.account_roles'),/permission denied/);
        await assert.rejects(query("UPDATE account_security.account_roles SET role='admin'"),/permission denied/);
        await db.exec('RESET ROLE');
    }
    assert.deepEqual(validateSelfProfileUpdate({school:'가상학교',church:'',bio:'line1\nline2'}),{school:'가상학교',church:'',bio:'line1\nline2'});
    for(const key of ['role','name','password','auth_user_id','status','is_master','current_haifn','preferences','constructor','toString','__proto__']) {
        assert.throws(()=>validateSelfProfileUpdate(JSON.parse(JSON.stringify({[key]:'injected'}))),e=>e.code==='invalid_request');
    }
    console.log('PASS account authorization: private role only, self scope, stale/revoked session denial, role revocation, no client writes, explicit profile fields');
}finally{await db.close();}
