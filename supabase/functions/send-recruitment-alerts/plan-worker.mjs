const normalizeSchoolName=(name='')=>String(name).replace(/\s+/g,'')
    .replace(/여자고등학교$/,'여고').replace(/여자중학교$/,'여중')
    .replace(/과학고등학교$/,'과고').replace(/외국어고등학교$/,'외고')
    .replace(/고등학교$/,'고').replace(/중학교$/,'중').replace(/초등학교$/,'초');

const checked=({data,error})=>{if(error)throw new Error(error.code||'database');return data;};

async function recipientUsers(db,job,notice) {
    let ids=null;
    let interestTokens=new Map();
    if(job.audience==='INTERESTED') {
        const rows=checked(await db.from('program_recruitment_interests')
            .select('auth_user_id,fcm_token').eq('notice_id',notice.id).eq('enabled',true));
        const authIds=[...new Set(rows.map(row=>row.auth_user_id))];
        if(!authIds.length)return [];
        const users=checked(await db.from('users').select('id,auth_user_id,fcm_token,school,status,role').in('auth_user_id',authIds));
        for(const row of rows)interestTokens.set(row.auth_user_id,row.fcm_token);
        return users.map(user=>({...user,interest_token:interestTokens.get(user.auth_user_id)||null}));
    }
    if(job.audience==='APPLICANTS') {
        const rows=checked(await db.from('notice_responses').select('user_id').eq('notice_id',notice.id).eq('status','JOIN'));
        ids=[...new Set(rows.map(row=>row.user_id).filter(Boolean))];
        if(!ids.length)return [];
    }
    let query=db.from('users').select('id,auth_user_id,fcm_token,school,status,role');
    if(ids)query=query.in('id',ids);
    let users=checked(await query).filter(user=>user.status!=='deleted' && String(user.role||'user').toLowerCase()!=='admin');
    // At recruitment start, opt-in users are handled by the mandatory heart
    // alert. Excluding them here prevents a simultaneous regional/global copy.
    if(job.timing==='AT_START') {
        const interests=checked(await db.from('program_recruitment_interests').select('auth_user_id').eq('notice_id',notice.id).eq('enabled',true));
        const optedIn=new Set(interests.map(row=>row.auth_user_id));
        users=users.filter(user=>!optedIn.has(user.auth_user_id));
    }
    if(job.audience!=='TARGET_REGIONS')return users;
    const regions=Array.isArray(notice.target_regions)?notice.target_regions.filter(Boolean):[];
    if(!regions.length || regions.length>=2)return users;
    const schools=checked(await db.from('schools').select('name').in('region',regions));
    const keys=new Set(schools.map(row=>normalizeSchoolName(row.name)).filter(Boolean));
    return users.filter(user=>keys.has(normalizeSchoolName(user.school)));
}

async function stableId(value) {
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    const bytes=new Uint8Array(digest).slice(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function deliverProgramPushPlans({db,sendUser,now=()=>new Date().toISOString()}) {
    const summary={jobs:0,sent:0,partial:0,failed:0,uncertain:0};
    const stale=new Date(Date.now()-10*60*1000).toISOString();
    await db.from('program_push_recipients').update({state:'UNCERTAIN',last_error_code:'stale_claim'}).eq('state','SENDING').lt('updated_at',stale);
    await db.from('program_push_jobs').update({state:'UNCERTAIN',last_error_code:'stale_claim'}).eq('state','SENDING').lt('updated_at',stale);
    const jobs=checked(await db.from('program_push_jobs').select('*').in('state',['PENDING','FAILED'])
        .lte('scheduled_at',now()).order('scheduled_at').limit(5));
    for(const job of jobs) {
        const claimed=checked(await db.from('program_push_jobs').update({state:'SENDING',updated_at:now()})
            .eq('id',job.id).eq('state',job.state).select('id').maybeSingle());
        if(!claimed)continue;
        summary.jobs++;
        try {
            const notice=checked(await db.from('notices').select('id,title,category,is_recruiting,is_private,program_status,recruitment_deadline,recruitment_start_at,recruitment_details_ready,target_regions,guest_properties')
                .eq('id',job.notice_id).maybeSingle());
            const invalid=!notice || notice.category!=='PROGRAM' || !notice.is_recruiting || notice.is_private ||
                ['CANCELLED','COMPLETED'].includes(notice.program_status) || !notice.recruitment_details_ready ||
                !notice.recruitment_deadline || Date.parse(notice.recruitment_deadline)<=Date.now();
            if(invalid) {
                await db.from('program_push_jobs').update({state:'CANCELLED',last_error_code:'program_not_eligible',updated_at:now()}).eq('id',job.id);
                continue;
            }
            const users=await recipientUsers(db,job,notice);
            if(users.length)checked(await db.from('program_push_recipients').upsert(users.map(user=>({job_id:job.id,user_id:user.id})),{onConflict:'job_id,user_id',ignoreDuplicates:true}));
            const rows=users.length?checked(await db.from('program_push_recipients').select('*').eq('job_id',job.id).in('state',['PENDING','FAILED'])):[];
            let success=0,failed=0;
            for(const row of rows) {
                const user=users.find(item=>item.id===row.user_id);
                const didClaim=checked(await db.from('program_push_recipients').update({state:'SENDING',updated_at:now()})
                    .eq('job_id',job.id).eq('user_id',row.user_id).in('state',['PENDING','FAILED']).select('user_id').maybeSingle());
                if(!didClaim)continue;
                const notificationId=await stableId(`program-push:${job.id}:${row.user_id}`);
                const bellBody=job.timing==='AT_START'
                    ? `${String(notice.title||'프로그램').slice(0,150)}\n프로그램 신청이 시작됐어요!`
                    : `${String(notice.title||'프로그램').slice(0,150)} · 앱에서 확인해보세요.`;
                const bell={id:notificationId,target_group:`USER_${row.user_id}`,notification_type:'RECRUITMENT',notice_id:notice.id,
                    content:`프로그램 알림\n${bellBody}`};
                const bellResult=await db.from('app_notifications').insert(bell);
                if(bellResult.error && bellResult.error.code!=='23505')throw new Error('bell_save_failed');
                let result;
                try {result=await sendUser({user,notice,job});} catch {result={state:'UNCERTAIN',deviceCount:0,successCount:0,failureCount:0,code:'transport_unknown'};}
                const state=result.state==='SENT'?'SENT':result.state==='SKIPPED'?'SKIPPED':result.state==='UNCERTAIN'?'UNCERTAIN':'FAILED';
                await db.from('program_push_recipients').update({state,device_count:result.deviceCount||0,success_count:result.successCount||0,
                    failure_count:result.failureCount||0,last_error_code:result.code||null,...(state==='SENT'?{sent_at:now()}:{}),updated_at:now()})
                    .eq('job_id',job.id).eq('user_id',row.user_id).eq('state','SENDING');
                if(state==='SENT'||state==='SKIPPED')success++;else failed++;
            }
            const all=checked(await db.from('program_push_recipients').select('state,device_count,success_count,failure_count').eq('job_id',job.id));
            const uncertain=all.some(row=>row.state==='UNCERTAIN');
            const failures=all.reduce((sum,row)=>sum+Number(row.failure_count||0),0);
            const successes=all.reduce((sum,row)=>sum+Number(row.success_count||0),0);
            const state=uncertain?'UNCERTAIN':failures>0?(successes>0?'PARTIAL':'FAILED'):'SENT';
            await db.from('program_push_jobs').update({state,target_count:all.length,success_count:successes,failure_count:failures,
                ...(state==='SENT'||state==='PARTIAL'?{sent_at:now()}:{}),updated_at:now()}).eq('id',job.id).eq('state','SENDING');
            await db.from('notices').update({guest_properties:{...(notice.guest_properties||{}),
                recruitment_push_dispatched_at:state==='SENT'||state==='PARTIAL'?now():null,
                recruitment_push_result:{state,target_count:all.length,success_count:successes,failure_count:failures}
            }}).eq('id',notice.id);
            summary[state.toLowerCase()]++;
        } catch(error) {
            await db.from('program_push_jobs').update({state:'FAILED',last_error_code:String(error?.message||'job_failed').slice(0,120),updated_at:now()}).eq('id',job.id).eq('state','SENDING');
            summary.failed++;
        }
    }
    return summary;
}
