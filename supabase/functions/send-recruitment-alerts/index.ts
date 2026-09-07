import { createClient } from 'npm:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';
import webpush from 'npm:web-push@3.6.7';
import { deliverRecruitmentAlerts,recruitmentMessage } from './worker.mjs';
import { saveRecruitmentBell } from './bell.mjs';
import { deliverProgramPushPlans } from './plan-worker.mjs';

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const equal=(a:string,b:string)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
const parseTokens=(value:unknown):string[]=>{if(!value)return [];try{const parsed=JSON.parse(String(value));if(Array.isArray(parsed))return parsed.filter(item=>typeof item==='string'&&item);}catch{}return [String(value)];};
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
        const sendUser=async({user,notice,job}:any)=>{
            const {data:registered,error:deviceError}=await db.from('push_devices')
                .select('id,provider,credential,browser,failure_count,enabled').eq('user_id',user.id);
            if(deviceError && deviceError.code!=='42P01')throw new Error('device_registry');
            const devices=(deviceError?[]:(registered||[])).filter((device:any)=>device.enabled);
            const hasRegistry=!deviceError && (registered||[]).length>0;
            const legacy=hasRegistry?[]:parseTokens(user.interest_token||user.fcm_token);
            const fcm=[...devices.filter((device:any)=>device.provider==='FCM'&&device.credential?.token)
                .map((device:any)=>({token:device.credential.token,device})),...legacy.map(token=>({token,device:null}))];
            const standard=devices.filter((device:any)=>device.provider==='WEB_PUSH'&&device.credential?.endpoint);
            if(!fcm.length&&!standard.length)return {state:'SKIPPED',deviceCount:0,successCount:0,failureCount:0,code:'no_registered_device'};
            let firebase;
            if(fcm.length){try{firebase=await (firebaseAccess??=(async()=>{const credentials=JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')||'{}');if(!credentials.project_id)throw new Error('firebase');const access=await new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/firebase.messaging']}).getAccessToken();if(!access)throw new Error('firebase token');return {projectId:credentials.project_id,access};})());}catch{return {state:'FAILED',deviceCount:fcm.length+standard.length,successCount:0,failureCount:fcm.length+standard.length,code:'firebase_auth_unavailable'};}}
            const origin=Deno.env.get('RECRUITMENT_APP_ORIGIN')||'';
            const title=job.audience==='APPLICANTS'?'프로그램 안내가 도착했어요':'프로그램 모집 알림';
            const body=job.timing==='AT_START'
                ? `${String(notice.title||'프로그램').slice(0,120)}\n프로그램 신청이 시작됐어요!`
                : `${String(notice.title||'프로그램').slice(0,120)} · 앱에서 확인해보세요.`;
            const link=`${origin}/p/${encodeURIComponent(notice.id)}`;
            const fcmResults=await Promise.all(fcm.map(async({token,device}:any)=>{try{const response=await fetch(`https://fcm.googleapis.com/v1/projects/${firebase.projectId}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${firebase.access}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token,notification:{title,body},data:{url:link,noticeId:String(notice.id)},webpush:{fcm_options:{link}}}}),signal:AbortSignal.timeout(5000)});return {ok:response.ok,device,code:response.ok?null:`fcm_${response.status}`};}catch{return {ok:false,device,uncertain:true,code:'transport_unknown'};}}));
            const publicKey=Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim();const privateKey=Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim();
            if(standard.length&&publicKey&&privateKey)webpush.setVapidDetails(Deno.env.get('WEB_PUSH_VAPID_SUBJECT')?.trim()||'mailto:admin@schoolchurchimpact.org',publicKey,privateKey);
            const webResults=await Promise.all(standard.map(async(device:any)=>{if(!publicKey||!privateKey)return {ok:false,device,code:'web_push_credentials_unavailable'};try{const response=await webpush.sendNotification(device.credential,JSON.stringify({notification:{title,body},data:{url:link,noticeId:String(notice.id)}}),{TTL:86400,contentEncoding:device.browser==='Samsung Internet'?'aesgcm':'aes128gcm'});return {ok:response.statusCode>=200&&response.statusCode<300,device,code:String(response.statusCode)};}catch(error){return {ok:false,device,uncertain:!error?.statusCode,code:String(error?.statusCode||'web_push_failed')};}}));
            const results=[...fcmResults,...webResults];
            await Promise.all(results.filter((item:any)=>item.device).map((item:any)=>db.from('push_devices').update(item.ok?{last_success_at:new Date().toISOString(),failure_count:0,last_failure_code:null}:{failure_count:Number(item.device.failure_count||0)+1,last_failure_code:item.code,...(['fcm_404','fcm_410','404','410'].includes(item.code)?{enabled:false}:{})}).eq('id',item.device.id)));
            const successCount=results.filter((item:any)=>item.ok).length;const failureCount=results.length-successCount;
            return {state:results.some((item:any)=>item.uncertain)?'UNCERTAIN':successCount?'SENT':'FAILED',deviceCount:results.length,successCount,failureCount,code:failureCount?'partial_device_failure':null};
        };
        const [legacy,plans]=await Promise.all([deliverRecruitmentAlerts({store,send}),deliverProgramPushPlans({db,sendUser})]);
        return json({legacy,plans});
    } catch {return json({error:'worker_failed'},500);}
});
