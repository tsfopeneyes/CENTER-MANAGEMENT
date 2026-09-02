import {LoginError} from './loginSecurity.mjs';

export function createLoginCandidateHandler({candidates,resolveClientKey,allowedOrigins=[]}){
    if(typeof candidates!=='function'||typeof resolveClientKey!=='function'||allowedOrigins.includes('*'))throw new Error('Trusted candidate HTTP configuration required');
    const origins=new Set(allowedOrigins);
    return async request=>{
        const origin=request.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
        const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
        if(origin&&!origins.has(origin))return response(403,{error:'request_not_allowed'});if(origin)headers['Access-Control-Allow-Origin']=origin;
        if(request.method==='OPTIONS'){headers['Access-Control-Allow-Methods']='POST, OPTIONS';headers['Access-Control-Allow-Headers']='content-type, apikey';return new Response(null,{status:204,headers});}
        if(request.method!=='POST')return response(405,{error:'method_not_allowed'});
        if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return response(415,{error:'json_required'});
        const reader=request.body?.getReader();if(!reader)return response(400,{error:'invalid_request'});
        const chunks=[];let size=0;
        try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
            if(size>2048){await reader.cancel();return response(413,{error:'request_too_large'});}chunks.push(value);}}
        catch{return response(400,{error:'invalid_request'});}
        const text=new TextDecoder().decode(chunks.length===1?chunks[0]:concat(chunks,size));
        let input;try{input=JSON.parse(text);}catch{return response(400,{error:'invalid_request'});}
        try{return response(200,await candidates(input,{clientKey:await resolveClientKey(request)}));}
        catch(error){if(error instanceof LoginError&&['invalid_request','try_later'].includes(error.code))return response(error.status,{error:error.code});return response(503,{error:'temporarily_unavailable'});}
    };
}

function concat(chunks,size){const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}return output;}
