import assert from 'node:assert/strict';
import {createMemberWithdrawalService} from '../supabase/functions/_shared/memberWithdrawalService.mjs';

const actor='10000000-0000-4000-8000-000000000001';
const target='10000000-0000-4000-8000-000000000002';
const queries=[];
const client={
    async query(text,values=[]){
        queries.push({text:String(text).replace(/\s+/g,' ').trim(),values});
        if(String(text).includes('account_security.account_roles')&&String(text).includes("role='admin'"))return {rows:[{ok:1}]};
        if(String(text).includes('FROM public.users u'))return {rows:[{id:target,user_group:'청소년',account_profile_id:target}]};
        if(String(text).includes('UPDATE public.users SET'))return {rows:[{id:target}]};
        return {rows:[]};
    },
    release(){}
};
const withdraw=createMemberWithdrawalService({pool:{connect:async()=>client},readiness:async()=>true,
    authorize:async()=>({actorProfileId:actor})});
assert.deepEqual(await withdraw({accessToken:'token',profileId:target}),{protocol:1,status:'withdrawn',profileId:target});
const sql=queries.map(item=>item.text).join('\n');
assert.match(sql,/login_identifiers SET enabled=false/);
assert.match(sql,/session_assurances SET status='revoked'/);
assert.match(sql,/accounts SET status='blocked'/);
assert.match(sql,/name=\$2,gender=NULL,school=NULL/);
assert.match(sql,/phone='',phone_back4=''/);
assert.match(sql,/status='withdrawn'/);
assert.doesNotMatch(sql,/DELETE FROM (public\.)?(logs|notice_responses|haifn_transactions)/i);
assert.equal(queries.at(-1).text,'COMMIT');
console.log('PASS member withdrawal: login revoked, personal profile anonymized, historical records untouched');
