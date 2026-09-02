import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {saveRecruitmentBell,recruitmentBellNotification} from '../supabase/functions/send-recruitment-alerts/bell.mjs';
import {deliverRecruitmentAlerts} from '../supabase/functions/send-recruitment-alerts/worker.mjs';
import {recruitmentNotificationGroup} from '../src/utils/recruitmentNotificationAudience.js';

const owner='00000000-0000-0000-0000-000000000001';
const row={id:'00000000-0000-0000-0000-000000000002',auth_user_id:owner,notice_id:1,title:'테스트 프로그램',attempts:1};
const db=new PGlite();
try {
    await db.exec(`CREATE TABLE app_notifications(id uuid PRIMARY KEY,target_group text NOT NULL,
        notification_type text NOT NULL,notice_id bigint,content text,created_at timestamptz DEFAULT now());
        CREATE TABLE user_notification_reads(notification_id uuid REFERENCES app_notifications(id),user_id uuid);`);
    // Exercise real unique-key behaviour through the same insert/read contract.
    const client={from:table=>{
        assert.equal(table,'app_notifications');
        return {
            insert:async n=>{
                try {
                    await db.query('INSERT INTO app_notifications(id,target_group,notification_type,notice_id,content) VALUES($1,$2,$3,$4,$5)',[n.id,n.target_group,n.notification_type,n.notice_id,n.content]);
                    return {error:null};
                } catch(error){return {error};}
            },
            select:()=>({eq:(_key,id)=>({single:async()=>({data:(await db.query('SELECT * FROM app_notifications WHERE id=$1',[id])).rows[0]})})}),
        };
    }};
    const notification=await recruitmentBellNotification(row);
    assert.equal(notification.target_group,`AUTH_${owner}`);
    assert.equal(notification.notification_type,'RECRUITMENT');
    assert.match(notification.id,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal((await recruitmentBellNotification({...row,attempts:4,title:'Edited'})).id,notification.id);
    let bellCalls=0, sends=0, released=0, finished;
    const store={list:async()=>[row],claim:async()=>true,current:async()=>row,
        notify:async r=>{bellCalls++;await saveRecruitmentBell(client,r);},
        release:async()=>{released++;},finish:async(_row,_attempt,patch)=>{finished=patch;}};
    const run=send=>deliverRecruitmentAlerts({store,send});
    await run(async()=>{
        sends++;
        assert.equal((await db.query('SELECT count(*)::int AS n FROM app_notifications')).rows[0].n,1);
        return {state:'failed',code:'fcm_404'};
    });
    assert.equal(finished.delivery_state,'failed');
    await db.query('INSERT INTO user_notification_reads VALUES($1,$2)',[notification.id,owner]);
    const before=(await db.query('SELECT * FROM app_notifications')).rows;
    await run(async()=>{sends++;return {state:'retry',code:'firebase_auth_unavailable'};});
    await run(async()=>{sends++;throw Error('timeout');});
    await run(async()=>{sends++;return {state:'sent'};});
    assert.equal(sends,4);
    assert.deepEqual((await db.query('SELECT * FROM app_notifications')).rows,before);
    assert.equal((await db.query('SELECT * FROM user_notification_reads')).rows.length,1);
    store.notify=async()=>{throw Error('bell_db_unavailable');};
    assert.equal((await run(async()=>{throw Error('must not send');})).bellFailed,1);
    assert.equal(released,1);
    store.current=async()=>null;
    await run(async()=>{throw Error('cancelled');});
    assert.equal(released,2);
    assert.equal(bellCalls,4);
    await db.query("UPDATE app_notifications SET target_group='AUTH_other' WHERE id=$1",[notification.id]);
    await assert.rejects(saveRecruitmentBell(client,row),/bell_identity_conflict/);
    assert.equal(recruitmentNotificationGroup({id:'legacy',auth_user_id:owner},{id:owner}),`AUTH_${owner}`);
    assert.equal(recruitmentNotificationGroup({id:owner},{id:owner}),`AUTH_${owner}`);
    assert.equal(recruitmentNotificationGroup({id:'other'},{id:owner}),null);
    assert.equal(recruitmentNotificationGroup({id:owner},{id:owner,is_anonymous:true}),null);
    assert.equal(recruitmentNotificationGroup({id:owner},null),null);
    const button=readFileSync(new URL('../src/components/student/components/RecruitmentInterestButton.jsx',import.meta.url),'utf8');
    assert.ok(button.includes('관심 프로그램으로 등록됐어요!'));
    assert.ok(!button.includes('모집 시작 시 알림이 와요!'));
    console.log('PASS: bell before push, FCM failure/unknown/auth failure, idempotent retries/read preservation, cancellation, save failure retry, recipient isolation and exact popup.');
}finally{await db.close();}
