import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveInterestConfirmation} from '../src/utils/recruitmentInterestConfirmation.js';
import {recruitmentBellNotification} from '../supabase/functions/send-recruitment-alerts/bell.mjs';

const owner='00000000-0000-0000-0000-000000000001';
const interestId='00000000-0000-0000-0000-000000000002';
const notifications=new Map();
let enabled=true, activeUser=owner, failInsert=false, verifyCalls=0;
const verify=async id=>{verifyCalls++;assert.equal(id,activeUser,'session changed');};
const db={from:table=>({
    select:columns=>{
        const filters={};
        const query={eq:(key,value)=>{filters[key]=value;return query;},single:async()=>{
            if(table==='program_recruitment_interests') {
                assert.deepEqual(filters,{notice_id:7,auth_user_id:owner,enabled:true});
                return enabled?{data:{id:interestId}}:{error:{code:'missing'}};
            }
            if(table==='program_calendar_previews') {
                assert.equal(columns,'title');assert.deepEqual(filters,{id:7});
                return {data:{title:'관심 프로그램 테스트'}};
            }
            assert.equal(table,'app_notifications');
            return {data:notifications.get(filters.id)};
        }};
        return query;
    },
    insert:async notification=>{
        assert.equal(table,'app_notifications');
        if(failInsert)return {error:{code:'42501'}};
        if(notifications.has(notification.id))return {error:{code:'23505'}};
        notifications.set(notification.id,{...notification,read:false});return {};
    },
})};
const save=()=>saveInterestConfirmation(db,7,owner,verify);
await save();
assert.equal(verifyCalls,2);
const notification=[...notifications.values()][0];
assert.equal(notification.target_group,`AUTH_${owner}`);
assert.equal(notification.notification_type,'RECRUITMENT_SAVED');
assert.equal(notification.content,'관심 프로그램으로 등록됐어요!\n관심 프로그램 테스트');
assert.equal(notification.notice_id,7);
notification.read=true;
await Promise.all([save(),save()]);
assert.equal(notifications.size,1);assert.equal(notification.read,true);
assert.notEqual((await recruitmentBellNotification({id:interestId,auth_user_id:owner,notice_id:7})).id,notification.id);
enabled=false;await assert.rejects(save());enabled=true;
activeUser='different-user';await assert.rejects(save(),/session changed/);activeUser=owner;
failInsert=true;await assert.rejects(save(),/save_failed/);failInsert=false;
notification.target_group='AUTH_other';await assert.rejects(save(),/identity_conflict/);
const button=readFileSync(new URL('../src/components/student/components/RecruitmentInterestButton.jsx',import.meta.url),'utf8');
assert.ok(button.includes('saved.bellSaved !== false'));
assert.ok(button.includes('관심 등록은 유지됩니다.'));
const hook=readFileSync(new URL('../src/hooks/dashboard/useDashboardNotifications.js',import.meta.url),'utf8');
assert.ok(hook.includes("addEventListener('recruitment-interest-changed', refresh)"));
assert.ok(hook.includes("removeEventListener('recruitment-interest-changed', refresh)"));
console.log('PASS: immediate confirmation, exact content, own audience, dedup/read preservation, separate start notice, cancellation/session/save failures and bell refresh wiring.');
