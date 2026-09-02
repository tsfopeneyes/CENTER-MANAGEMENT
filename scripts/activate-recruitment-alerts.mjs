// Scoped operational helper: explicit CLI path + mode required. Never prints
// credentials, raw CLI output, upstream diagnostics or user/device data.
import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import dotenv from 'dotenv';
const cli=process.env.RECRUITMENT_SUPABASE_CLI;
const mode=process.argv[2];
const ref='erecqalsxoxrufggvmcc';
const endpoint=`https://${ref}.supabase.co/functions/v1/send-recruitment-alerts`;
if(!cli || !existsSync(cli) || !['configure','enable','probe'].includes(mode))throw new Error('Explicit CLI path and configure/enable/probe mode required');
const run=args=>new Promise((resolve,reject)=>{
    const child=spawn(cli,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',diagnostic='';child.stdout.on('data',part=>{output+=part;});child.stderr.on('data',part=>{diagnostic+=part;});
    child.on('error',()=>reject(new Error('CLI start failed')));
    child.on('close',code=>{
        const category=/access token|log.?in|unauthorized/i.test(diagnostic)?'authentication':/linked|local|docker/i.test(diagnostic)?'target':/unknown|flag|argument/i.test(diagnostic)?'arguments':/permission/i.test(diagnostic)?'permission':'unclassified';
        code===0?resolve(output):reject(new Error(`CLI ${args[0]} operation failed (${category}); raw output withheld`));
    });
});
const query=async sql=>{
    const raw=await run(['db','query','--linked','--project-ref',ref,'--output','json',sql]);
    try {return JSON.parse(raw).rows;}catch {throw new Error('Unexpected CLI response; raw output withheld');}
};
try {
    const rows=await query("SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='recruitment_alerts_cron_secret'");
    const secret=rows?.[0]?.decrypted_secret;
    if(rows?.length!==1 || !/^[a-f0-9]{64}$/.test(secret||''))throw new Error('Dedicated secret unavailable');
    if(mode==='configure') {
        await run(['secrets','set','--project-ref',ref,`RECRUITMENT_ALERTS_CRON_SECRET=${secret}`,
            'RECRUITMENT_APP_ORIGIN=https://app.schoolchurchimpact.org','RECRUITMENT_ALERTS_ENABLED=false']);
        console.log('Dedicated secret configured; delivery disabled.');
    }
    if(mode==='enable') {
        const counts=await query('SELECT count(*)::int AS total FROM public.program_recruitment_interests');
        if(counts?.[0]?.total!==0)throw new Error('Nonempty interest queue; review recipients before activation');
        await run(['secrets','set','--project-ref',ref,'RECRUITMENT_ALERTS_ENABLED=true']);
        console.log('Recruitment delivery enabled; queue was empty.');
    }
    const anon=dotenv.parse(readFileSync('.env')).VITE_SUPABASE_ANON_KEY;
    for(const [label,authorization,expected] of [
        ['missing-secret',null,401],['public-key',`Bearer ${anon}`,401],
        ['cron-secret',`Bearer ${secret}`,mode==='configure'?503:200],
    ]) {
        const response=await fetch(endpoint,{method:'POST',headers:authorization?{Authorization:authorization}:{},signal:AbortSignal.timeout(30000)});
        console.log(`${label}: HTTP ${response.status}`);
        if(response.status!==expected)throw new Error('Endpoint status mismatch; wait for secret propagation and inspect safely');
        if(label==='cron-secret' && response.status===200){
            const result=await response.json();
            console.log(JSON.stringify({sent:result.sent,skipped:result.skipped,failed:result.failed,uncertain:result.uncertain}));
        }
    }
} catch(error) {console.error(error.message);process.exitCode=1;}
