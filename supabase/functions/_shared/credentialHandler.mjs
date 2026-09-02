import {LoginError} from './loginSecurity.mjs';

// Shared bounded HTTP adapter for administrator reset and one-use password
// replacement. Authorization and identity confirmation remain service-side.
export function createCredentialHandler({credentials,resolveClientKey,allowedOrigins=[],timeoutMs=10000,
    schedule=setTimeout,cancelTimer=clearTimeout}){
    if(!credentials||typeof credentials.reset!=='function'||typeof credentials.changeTemporary!=='function'||
        typeof resolveClientKey!=='function'||allowedOrigins.includes('*')||!Number.isFinite(timeoutMs)||
        timeoutMs<1000||timeoutMs>30000)throw new Error('Trusted credential HTTP configuration required');
    const origins=new Set(allowedOrigins);
    return async request=>{
        const origin=request.headers.get('Origin');
        const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
        const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
        if(origin&&!origins.has(origin))return response(403,{error:'request_not_allowed'});
        if(origin)headers['Access-Control-Allow-Origin']=origin;
        if(request.method==='OPTIONS'){
            headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='content-type, apikey, authorization';
            return new Response(null,{status:204,headers});
        }
        if(request.method!=='POST')return response(405,{error:'method_not_allowed'});
        if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response(415,{error:'json_required'});
        const abort=new AbortController(),onAbort=()=>abort.abort();request.signal.addEventListener('abort',onAbort,{once:true});
        if(request.signal.aborted)abort.abort();let timer;
        const deadline=new Promise(resolve=>{timer=schedule(()=>{abort.abort();resolve(response(503,{error:'temporarily_unavailable'}));},timeoutMs);});
        const work=async()=>{
            const reader=request.body?.getReader();if(!reader)return response(400,{error:'invalid_request'});
            const chunks=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};abort.signal.addEventListener('abort',cancel,{once:true});
            try{
                while(!abort.signal.aborted){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
                    if(size>8192){await reader.cancel();return response(413,{error:'request_too_large'});}chunks.push(value);}
            }finally{abort.signal.removeEventListener('abort',cancel);reader.releaseLock();}
            if(abort.signal.aborted)return response(503,{error:'temporarily_unavailable'});
            const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
            let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return response(400,{error:'invalid_request'});}
            const actions=['reset','change-temporary',...(typeof credentials.confirmReset==='function'?['confirm-reset']:[]),
                ...(typeof credentials.changeSelf==='function'?['change-self']:[])];
            if(!input||typeof input!=='object'||Array.isArray(input)||!actions.includes(input.action))return response(400,{error:'invalid_request'});
            const {action,...payload}=input,clientKey=await resolveClientKey(request);
            const authorization=request.headers.get('Authorization');
            const accessToken=typeof authorization==='string'&&/^Bearer [^\s]{1,8192}$/.test(authorization)?authorization.slice(7):null;
            const context={clientKey,signal:abort.signal,...(accessToken?{accessToken}:{})};
            const result=action==='reset'?await credentials.reset(payload,context):action==='change-temporary'?
                await credentials.changeTemporary(payload,context):action==='confirm-reset'?
                    await credentials.confirmReset(payload,context):await credentials.changeSelf(payload,context);
            return abort.signal.aborted?response(503,{error:'temporarily_unavailable'}):response(200,result);
        };
        try{return await Promise.race([work(),deadline]);}
        catch(error){
            if(error instanceof LoginError&&['invalid_request','invalid_login','forbidden','try_later','password_policy','account_changed'].includes(error.code))
                return response(error.status,{error:error.code});
            return response(503,{error:'temporarily_unavailable'});
        }finally{cancelTimer(timer);request.signal.removeEventListener('abort',onAbort);}
    };
}
