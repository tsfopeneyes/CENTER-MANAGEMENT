import assert from 'node:assert/strict';
import {resolveAuthLink,authLinkStore} from '../supabase/functions/dispatch-notification/auth-link.mjs';
import {verifiedProfileLogin} from '../src/utils/verifiedProfileLogin.js';
import {isVisitorOrTemporary} from '../src/utils/memberAccountType.js';
assert.equal(isVisitorOrTemporary({user_group:'청소년',auth_user_id:null}),false);
assert.equal(isVisitorOrTemporary({user_group:'관리자',email:null}),false);
assert.equal(isVisitorOrTemporary({user_group:'게스트'}),true);
assert.equal(isVisitorOrTemporary({user_group:'청소년',preferences:{is_temporary:true}}),true);
const profile={id:'profile',phone:'01012345678',user_group:'청소년'};
function fixture(initial=[]) {
 const accounts=new Map(initial.map(a=>[a.id,a]));let linked=null,created=0;
 const store={getAuth:async id=>accounts.get(id)||null,
 findAuth:async emails=>[...accounts.values()].filter(a=>emails.includes(a.email)),
 createAuth:async values=>{if([...accounts.values()].some(a=>a.email===values.email))throw Error('duplicate');const a={...values,id:`new-${++created}`};accounts.set(a.id,a);return a;},
 hasOtherOwner:async()=>false,linkIfEmpty:async(_id,id)=>{if(linked && linked!==id)throw Error('changed');linked=id;},
 };
 return {store,accounts,get created(){return created;},get linked(){return linked;}};
}
let f=fixture([{id:'profile',email:'original@example.test'}]);
assert.equal((await resolveAuthLink(profile,'hash',f.store)).email,'original@example.test');assert.equal(f.created,0);
f=fixture([{id:'profile',email:'old@example.test'},{id:'linked',email:'current@example.test'}]);
assert.equal((await resolveAuthLink({...profile,auth_user_id:'linked'},'hash',f.store)).auth_user_id,'linked');assert.equal(f.created,0);
await assert.rejects(resolveAuthLink({...profile,auth_user_id:'missing'},'hash',f.store));assert.equal(f.created,0);
f=fixture([{id:'other',email:'01012345678@youth-access.app'}]);
await assert.rejects(resolveAuthLink(profile,'hash',f.store));assert.equal(f.created,0);
f=fixture();
const concurrent=await Promise.all([resolveAuthLink(profile,'hash',f.store),resolveAuthLink(profile,'hash',f.store)]);
assert.equal(f.created,1);assert.equal(concurrent[0].auth_user_id,concurrent[1].auth_user_id);
assert.equal((await resolveAuthLink(profile,'hash',f.store)).auth_user_id,concurrent[0].auth_user_id);assert.equal(f.created,1);
f=fixture();f.store.getAuth=async()=>{throw Error('network');};
await assert.rejects(resolveAuthLink(profile,'hash',f.store));assert.equal(f.created,0);
f=fixture([{id:'profile',email:'a@example.test'}]);f.store.hasOtherOwner=async()=>true;
await assert.rejects(resolveAuthLink(profile,'hash',f.store));assert.equal(f.created,0);
f=fixture();await assert.rejects(resolveAuthLink({...profile,user_group:'게스트'},'hash',f.store));assert.equal(f.created,0);
await assert.rejects(resolveAuthLink({...profile,preferences:{is_temporary:true}},'hash',f.store));
f=fixture([{id:'profile',email:'existing@example.test'}]);
assert.equal((await resolveAuthLink({...profile,preferences:{is_temporary:true}},'hash',f.store)).auth_user_id,'profile');
assert.equal(f.created,0);
f=fixture();const link=f.store.linkIfEmpty;f.store.linkIfEmpty=async()=>{throw Error('save failed');};
await assert.rejects(resolveAuthLink(profile,'hash',f.store));assert.equal(f.created,1);
f.store.linkIfEmpty=link;await resolveAuthLink(profile,'hash',f.store);assert.equal(f.created,1);
// Complete admin pagination, not just the first page.
let pages=0;
const paged=authLinkStore('https://example.test','mock',async()=>new Response(JSON.stringify({users:++pages===1?Array.from({length:100},(_,i)=>({id:`${i}`,email:'other'})):[{id:'late',email:'match'}]})));
assert.equal((await paged.findAuth(['match']))[0].id,'late');assert.equal(pages,2);
let signouts=0;
await assert.rejects(verifiedProfileLogin({profileId:'profile',password:'raw',hashedPassword:'hash',resolve:async()=>({auth_user_id:'expected',email:'expected@example.test'}),
 auth:{signInWithPassword:async()=>({data:{user:{id:'wrong'}},error:null}),signOut:async()=>{signouts++;}}}));
assert.equal(signouts,1);
assert.equal(await verifiedProfileLogin({profileId:'profile',password:'raw',hashedPassword:'hash',resolve:async()=>({auth_user_id:'expected',email:'expected@example.test'}),
 auth:{signInWithPassword:async()=>({data:{user:{id:'expected'}},error:null})}}),'expected');
// Older accounts may accept the entered password, not its client-side hash.
const attemptedPasswords=[];
assert.equal(await verifiedProfileLogin({profileId:'profile',password:'raw',hashedPassword:'hash',resolve:async()=>({auth_user_id:'expected',email:'expected@example.test'}),
 auth:{signInWithPassword:async({password})=>{attemptedPasswords.push(password);return password==='hash'?{error:{message:'Invalid credentials'}}:{data:{user:{id:'expected'}},error:null};}}}),'expected');
assert.deepEqual(attemptedPasswords,['hash','raw']);
let rejectedSignouts=0;
await assert.rejects(verifiedProfileLogin({profileId:'profile',password:'raw',hashedPassword:'hash',resolve:async()=>({auth_user_id:'expected',email:'expected@example.test'}),
 auth:{signInWithPassword:async()=>({error:{message:'Invalid credentials'}}),signOut:async()=>{rejectedSignouts++;}}}));
assert.equal(rejectedSignouts,1);
console.log('PASS: existing identity reuse, stable canonical link, dangling/conflicting links, deterministic concurrent creation, partial-failure recovery, guest exclusion, pagination, exact login identity, legacy password fallback and failed login cleanup.');
