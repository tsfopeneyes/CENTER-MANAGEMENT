// Dependency-injected so consent, claim races and FCM failures can be tested
// without contacting real users. An ambiguous delivery is never auto-retried.
export async function deliverRecruitmentAlerts({store,send,now=()=>Date.now(),uuid=()=>crypto.randomUUID()}) {
    const summary={sent:0,skipped:0,failed:0,uncertain:0,bellFailed:0};
    const rows=await store.list();
    for(const row of rows) {
        const attempt=uuid();
        if(!await store.claim(row,attempt)){summary.skipped++;continue;}
        let current=await store.current(row.id,attempt);
        if(!current){
            // No send took place. Release unchanged claims after date/readiness
            // edits so a postponed program can become eligible again later.
            await store.release?.(row,attempt);
            summary.skipped++;continue;
        }
        // The bell is durable before FCM is attempted, even if the browser
        // suppresses an accepted push or Firebase credentials are unavailable.
        try {await store.notify(current);} catch {
            await store.release(row,attempt);
            summary.bellFailed++;
            continue;
        }
        current=await store.current(row.id,attempt);
        if(!current){await store.release(row,attempt);summary.skipped++;continue;}
        let result;
        try {result=await send(current);} catch {result={state:'uncertain',code:'transport_unknown'};}
        const retry=result.state==='retry' && current.attempts<5;
        const state=result.state==='retry'?(retry?'retry':'failed'):result.state;
        const patch={delivery_state:state,last_error_code:result.code||null,
            ...(state==='sent'?{sent_at:new Date(now()).toISOString()}:{}),
            ...(retry?{next_attempt_at:new Date(now()+Math.min(3600,60*2**current.attempts)*1000).toISOString()}:{}),
        };
        // If acknowledgement storage fails, leave 'sending' for operator review.
        // Automatically reclaiming it could send the same alert twice.
        await store.finish(current,attempt,patch);
        summary[state==='sent'?'sent':state==='uncertain'?'uncertain':'failed']++;
    }
    return summary;
}

export function recruitmentMessage(row,origin,now=Date.now()) {
    const url=new URL(origin);
    if(url.protocol!=='https:' || url.origin!==origin)throw new Error('Invalid app origin');
    return {message:{token:row.fcm_token,
        notification:{title:'모집이 시작됐어요!',body:`${String(row.title||'관심 프로그램').slice(0,150)}\n프로그램 신청이 시작됐어요!`},
        webpush:{headers:{TTL:String(Math.max(0,Math.min(3600,Math.floor((Date.parse(row.recruitment_deadline)-now)/1000)))),Topic:row.id.replaceAll('-','')},
            notification:{tag:`recruitment-${row.id}`},fcm_options:{link:`${origin}/p/${encodeURIComponent(row.notice_id)}`}},
    }};
}
