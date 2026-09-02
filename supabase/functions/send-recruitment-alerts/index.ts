import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';
import { deliverRecruitmentAlerts,recruitmentMessage } from './worker.mjs';
import { saveRecruitmentBell } from './bell.mjs';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const equal=(a:string,b:string)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
Deno.serve(async request=>{
    const secret=Deno.env.get('RECRUITMENT_ALERTS_CRON_SECRET')||'';
    if(request.method!=='POST')return json({error:'method'},405);
    if(secret.length<32 || !equal(request.headers.get('Authorization')||'',`Bearer ${secret}`))return json({error:'unauthorized'},401);
    if(Deno.env.get('RECRUITMENT_ALERTS_ENABLED')!=='true')return json({error:'disabled'},503);
    try {
        const origin=Deno.env.get('RECRUITMENT_APP_ORIGIN')||'';
        const parsed=new URL(origin);
        if(parsed.protocol!=='https:' || parsed.origin!==origin)throw new Error('origin');
        const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        const checked=({data,error}:any)=>{if(error)throw new Error('database');return data;};
        const table=()=>db.from('program_recruitment_interests');
        const store={
            notify:async(row:any)=>saveRecruitmentBell(db,row),
            list:async()=>checked(await db.from('program_recruitment_alert_due').select('*').in('delivery_state',['pending','retry']).order('next_attempt_at').limit(20)),
            claim:async(row:any,attempt:string)=>!!checked(await table().update({delivery_state:'sending',attempt_id:attempt,attempts:row.attempts+1})
                .eq('id',row.id).eq('revision',row.revision).eq('delivery_state',row.delivery_state).eq('enabled',true).select('id').maybeSingle()),
            current:async(id:string,attempt:string)=>checked(await db.from('program_recruitment_alert_due').select('*').eq('id',id).eq('attempt_id',attempt).maybeSingle()),
            release:async(row:any,attempt:string)=>checked(await table().update({delivery_state:'pending',attempt_id:null,next_attempt_at:new Date(Date.now()+60000).toISOString()})
                .eq('id',row.id).eq('revision',row.revision).eq('attempt_id',attempt)),
            finish:async(row:any,attempt:string,patch:unknown)=>checked(await table().update(patch).eq('id',row.id).eq('revision',row.revision).eq('attempt_id',attempt).eq('enabled',true)),
        };
        // Resolve credentials only after the in-app bell has been saved.
        let firebaseAccess:Promise<{projectId:string,access:string}> | undefined;
        const send=async(row:any)=>{
            let firebase;
            try {
                firebaseAccess ??= (async()=>{
                    const credentials=JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')||'{}');
                    if(!credentials.project_id)throw new Error('firebase');
                    const access=await new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/firebase.messaging']}).getAccessToken();
                    if(!access)throw new Error('firebase token');
                    return {projectId:credentials.project_id,access};
                })();
                firebase=await firebaseAccess;
            } catch {return {state:'retry',code:'firebase_auth_unavailable'};}
            const response=await fetch(`https://fcm.googleapis.com/v1/projects/${firebase.projectId}/messages:send`,{
                method:'POST',headers:{Authorization:`Bearer ${firebase.access}`,'Content-Type':'application/json'},
                body:JSON.stringify(recruitmentMessage(row,origin)),signal:AbortSignal.timeout(5000),
            });
            if(response.ok)return {state:'sent'};
            // Do not log device tokens or service responses containing tokens.
            return {state:[429,500,503].includes(response.status)?'retry':'failed',code:`fcm_${response.status}`};
        };
        return json(await deliverRecruitmentAlerts({store,send}));
    } catch {return json({error:'worker_failed'},500);}
});
