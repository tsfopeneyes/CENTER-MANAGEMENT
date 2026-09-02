import {LoginError} from './loginSecurity.mjs';

// No default client identity: deployment must supply a trusted ingress identity.
// Never pass an unverified forwarding header through as resolveClientKey.
export function createLoginHandler({login, resolveClientKey, allowedOrigins = [], timeoutMs = 10000,
    schedule = setTimeout, cancelTimer = clearTimeout}) {
    if (typeof resolveClientKey !== 'function' || allowedOrigins.includes('*')) throw new Error('Trusted ingress configuration required');
    const origins = new Set(allowedOrigins);
    return async request => {
        const origin = request.headers.get('Origin');
        const headers = {'Content-Type':'application/json','Cache-Control':'no-store',
            'X-Content-Type-Options':'nosniff',Vary:'Origin'};
        const response = (status,body) => new Response(JSON.stringify(body),{status,headers});
        if (origin && !origins.has(origin)) return response(403,{error:'request_not_allowed'});
        if (origin) headers['Access-Control-Allow-Origin'] = origin;
        if (request.method === 'OPTIONS') {
            headers['Access-Control-Allow-Methods']='POST, OPTIONS';
            headers['Access-Control-Allow-Headers']='content-type, apikey';
            return new Response(null,{status:204,headers});
        }
        if (request.method !== 'POST') return response(405,{error:'method_not_allowed'});
        if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return response(415,{error:'json_required'});
        const abort = new AbortController();
        const onAbort = () => abort.abort();
        request.signal.addEventListener('abort',onAbort,{once:true});
        if(request.signal.aborted)abort.abort();
        let timer;
        const deadline = new Promise(resolve => { timer=schedule(()=>{
            abort.abort();resolve(response(503,{error:'temporarily_unavailable'}));
        },timeoutMs); });
        const timings=[];
        const exposeTimings=()=>{if(!timings.length)return;headers['Server-Timing']=timings.filter(item=>Array.isArray(item)&&/^[a-z]+$/.test(item[0])&&Number.isFinite(item[1]))
                .map(([name,duration])=>`${name};dur=${duration}`).join(', ');headers['Access-Control-Expose-Headers']='Server-Timing';};
        const work = async () => {
            const reader = request.body?.getReader();
            if (!reader) return response(400,{error:'invalid_request'});
            const cancel = () => { void reader.cancel().catch(()=>{}); };
            abort.signal.addEventListener('abort',cancel,{once:true});
            let size=0;
            const chunks=[];
            try {
                while(!abort.signal.aborted) {
                    const {done,value}=await reader.read(); if(done)break;
                    size+=value.byteLength;
                    if(size>4096){await reader.cancel();return response(413,{error:'request_too_large'});}
                    chunks.push(value);
                }
            } finally { abort.signal.removeEventListener('abort',cancel);reader.releaseLock(); }
            if(abort.signal.aborted)return response(503,{error:'temporarily_unavailable'});
            const bytes=new Uint8Array(size);let offset=0;
            for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
            let input;
            try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
            catch{return response(400,{error:'invalid_request'});}
            const clientKey=await resolveClientKey(request);
            const result=await login(input,{clientKey,signal:abort.signal,timings});
            if(abort.signal.aborted)return response(503,{error:'temporarily_unavailable'});
            exposeTimings();
            // Tokens are the intended successful login result, never diagnostic
            // output. No password, email, candidate list or arbitrary store fields.
            return response(200,{protocol:1,profileId:result.profileId,authUserId:result.authUserId,
                session:{access_token:result.session.access_token,refresh_token:result.session.refresh_token,
                    expires_at:result.session.expires_at}});
        };
        try{return await Promise.race([work(),deadline]);}
        catch(error){
            exposeTimings();
            if(error instanceof LoginError && ['invalid_login','try_later','password_change_required','account_changed','name_not_found','selection_required'].includes(error.code)) {
                return response(error.status,{error:error.code});
            }
            return response(503,{error:'temporarily_unavailable'});
        } finally {cancelTimer(timer);request.signal.removeEventListener('abort',onAbort);}
    };
}
