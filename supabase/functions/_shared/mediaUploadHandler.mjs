import {LoginError} from './loginSecurity.mjs';

export function createMediaUploadHandler({upload,resolveClientKey,allowedOrigins=[]}){
    if(typeof upload!=='function'||typeof resolveClientKey!=='function'||allowedOrigins.includes('*'))throw new Error('Trusted upload HTTP configuration required');
    const origins=new Set(allowedOrigins);
    return async request=>{
        const origin=request.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
        const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers});
        if(origin&&!origins.has(origin))return respond(403,{error:'request_not_allowed'});if(origin)headers['Access-Control-Allow-Origin']=origin;
        if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='authorization, content-type, apikey, x-profile-id, x-upload-kind';return new Response(null,{status:204,headers});}
        if(request.method!=='POST')return respond(405,{error:'method_not_allowed'});
        const authorization=request.headers.get('Authorization')||'',match=/^Bearer ([^\s]+)$/.exec(authorization);
        const contentType=request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
        if(!match||match[1].length>8192)return respond(401,{error:'invalid_login'});
        const reader=request.body?.getReader();if(!reader)return respond(400,{error:'invalid_request'});
        const chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
            if(size>8*1024*1024){await reader.cancel();return respond(413,{error:'request_too_large'});}chunks.push(value);}}
        catch{return respond(400,{error:'invalid_request'});}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        try{return respond(200,await upload({accessToken:match[1],profileId:request.headers.get('x-profile-id'),
            kind:request.headers.get('x-upload-kind'),contentType,bytes},{clientKey:await resolveClientKey(request),signal:request.signal}));}
        catch(error){if(error instanceof LoginError){const safe=new Set(['invalid_request','invalid_login','forbidden','try_later','upload_conflict']);
            return respond(error.status,{error:safe.has(error.code)?error.code:'temporarily_unavailable'});}return respond(503,{error:'temporarily_unavailable'});}
    };
}
